/**
 * JM图片查看器 - 主应用脚本
 * 依赖: layers-calculator.js, md5.min.js
 */
(function() {
    'use strict';

    // ========== 配置 ==========
    const CONFIG = {
        MAX_PAGES: 99999,
        LAZY_LOAD_THRESHOLD: 300, // 距离底部多少px时触发加载
        DETECTION_DELAY: 10,      // 页码检测时的延迟(ms)
        INITIAL_LOAD_COUNT: 2,    // 初始加载的图片数量
    };

    // ========== CDN配置 ==========
    const CDN_LIST = [
        'https://cdn-msp2.jm18c-oec.cc/media/photos/',
        'https://cdn-msp2.jm18c-fuyu.cc/media/photos/',
        'https://cdn-msp2.jm18c-fuyu.me/media/photos/',
        'https://cdn-msp2.jmcomic-zzz.one/media/photos/'
    ];

    // ========== 状态管理 ==========
    const state = {
        originalImages: {},     // 原图缓存: { 'cdnPrefix_page': Image }
        autoLayers: {},         // 分割数缓存: { page: layers }
        pageTasks: [],          // 待加载的页码数组（严格递增）
        loadedPages: new Set(), // 已加载的页码
        currentCDN: '',         // 当前CDN前缀
        currentJMId: '',        // 当前JM号
        isLoading: false,       // 是否正在加载
        nextIndexToLoad: 0,     // 下一个要加载的索引
        scrollHandler: null,    // 滚动事件处理器
    };

    // ========== DOM元素缓存 ==========
    const dom = {
        jmId: document.getElementById('jmId'),
        cdnSelect: document.getElementById('cdnSelect'),
        startBtn: document.getElementById('startBtn'),
        status: document.getElementById('status'),
        gallery: document.getElementById('gallery'),
    };

    // ========== 工具函数 ==========
    function padNumber(num, length = 5) {
        return String(num).padStart(length, '0');
    }

    function updateStatus(message) {
        dom.status.textContent = message;
        dom.status.style.display = message ? 'block' : 'none';
    }

    function setLoading(isLoading) {
        dom.startBtn.disabled = isLoading;
        dom.cdnSelect.disabled = isLoading;
    }

    // ========== CDN初始化 ==========
    function initCDNSelect() {
        dom.cdnSelect.innerHTML = '';
        CDN_LIST.forEach((cdn, index) => {
            const option = document.createElement('option');
            option.value = cdn;
            option.textContent = `分流${index + 1}`;
            dom.cdnSelect.appendChild(option);
        });
    }

    // ========== 图片URL构建 ==========
    function getImageUrl(cdnPrefix, jmId, pageNum) {
        const fileName = padNumber(pageNum) + '.webp';
        return cdnPrefix + jmId + '/' + fileName;
    }

    // ========== 图片存在性检测 ==========
    async function checkImageExists(cdnPrefix, jmId, pageNum) {
        const url = getImageUrl(cdnPrefix, jmId, pageNum);
        
        return new Promise((resolve) => {
            const img = new Image();
            const timeout = setTimeout(() => {
                img.src = '';
                resolve(false);
            }, 5000); // 5秒超时

            img.onload = () => {
                clearTimeout(timeout);
                resolve(true);
            };
            
            img.onerror = () => {
                clearTimeout(timeout);
                resolve(false);
            };
            
            img.src = url;
        });
    }

    // ========== 页码检测（智能跳过缺失页） ==========
    async function detectAllPages(cdnPrefix, jmId) {
        const found = [];
        let page = 1;
        let consecutiveMisses = 0;
        const MAX_CONSECUTIVE_MISSES = 5;

        updateStatus('🔍 正在检测页码...');

        while (page <= CONFIG.MAX_PAGES) {
            updateStatus(`🔍 检测中: 第 ${page} 页`);

            const exists = await checkImageExists(cdnPrefix, jmId, page);

            if (exists) {
                found.push(page);
                consecutiveMisses = 0;
                page++;
            } else {
                consecutiveMisses++;
                
                // 连续缺失超过阈值，认为到达末尾
                if (consecutiveMisses >= MAX_CONSECUTIVE_MISSES) {
                    break;
                }
                
                page++;
            }

            // 小延迟，避免请求过于频繁
            await new Promise(r => setTimeout(r, CONFIG.DETECTION_DELAY));
        }

        return found.sort((a, b) => a - b);
    }

    // ========== 分割层数获取（使用LayersCalculator库） ==========
    async function fetchAutoLayer(jmId, page) {
        if (state.autoLayers[page] !== undefined) {
            return state.autoLayers[page];
        }

        try {
            const result = LayersCalculator.calculate(jmId, page);
            state.autoLayers[page] = result.layers;
            return result.layers;
        } catch (e) {
            console.error(`计算第${page}页分割层数失败:`, e);
            state.autoLayers[page] = 4; // 默认值
            return 4;
        }
    }

    // ========== 原图加载 ==========
    async function loadOriginalImage(cdnPrefix, jmId, page) {
        const cacheKey = cdnPrefix + '_' + page;

        if (state.originalImages[cacheKey]) {
            return state.originalImages[cacheKey];
        }

        const imgUrl = getImageUrl(cdnPrefix, jmId, page);
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`第${page}页加载超时`));
            }, 30000); // 30秒超时

            img.onload = () => {
                clearTimeout(timeout);
                resolve();
            };

            img.onerror = () => {
                clearTimeout(timeout);
                reject(new Error(`第${page}页加载失败`));
            };

            img.src = imgUrl;
        });

        state.originalImages[cacheKey] = img;
        return img;
    }

    // ========== 图片重组（反转分割） ==========
    function reassembleImage(originalImg, sliceCount) {
        return new Promise((resolve, reject) => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const width = originalImg.naturalWidth;
                const height = originalImg.naturalHeight;

                canvas.width = width;
                canvas.height = height;

                const sliceHeight = Math.floor(height / sliceCount);
                const remainder = height % sliceCount;

                ctx.clearRect(0, 0, width, height);

                for (let i = 0; i < sliceCount; i++) {
                    const currentSliceHeight = (i === sliceCount - 1) 
                        ? sliceHeight + remainder 
                        : sliceHeight;
                    
                    const sourceY = (sliceCount - 1 - i) * sliceHeight;
                    const destY = i * sliceHeight;

                    ctx.drawImage(
                        originalImg,
                        0, sourceY,
                        width, currentSliceHeight,
                        0, destY,
                        width, currentSliceHeight
                    );
                }

                const newImg = new Image();
                newImg.onload = () => resolve(newImg);
                newImg.onerror = () => reject(new Error('重组失败'));
                newImg.src = canvas.toDataURL('image/webp', 0.92);
            } catch (error) {
                reject(error);
            }
        });
    }

    // ========== 加载并处理单个页面 ==========
    async function loadAndDisplayPage(page) {
        try {
            // 加载原图
            const originalImg = await loadOriginalImage(
                state.currentCDN, 
                state.currentJMId, 
                page
            );

            // 获取分割层数
            let sliceCount = state.autoLayers[page];
            if (sliceCount === undefined) {
                sliceCount = await fetchAutoLayer(state.currentJMId, page);
            }

            // 重组图片
            return await reassembleImage(originalImg, sliceCount);
        } catch (error) {
            console.error(`处理第${page}页失败:`, error);
            return null;
        }
    }

    // ========== 懒加载逻辑 ==========
    function lazyLoadCheck() {
        if (state.isLoading || state.nextIndexToLoad >= state.pageTasks.length) {
            return;
        }

        const scrollY = window.scrollY;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;

        if (documentHeight - (scrollY + windowHeight) < CONFIG.LAZY_LOAD_THRESHOLD) {
            loadNextPage();
        }
    }

    async function loadNextPage() {
        if (state.isLoading || state.nextIndexToLoad >= state.pageTasks.length) {
            return;
        }

        state.isLoading = true;

        const currentIndex = state.nextIndexToLoad;
        const page = state.pageTasks[currentIndex];

        updateStatus(`📥 加载中: 第 ${page} 页 (${currentIndex + 1}/${state.pageTasks.length})`);

        try {
            const img = await loadAndDisplayPage(page);
            
            if (img) {
                dom.gallery.appendChild(img);
                state.loadedPages.add(page);
            }

            state.nextIndexToLoad = currentIndex + 1;

            // 更新状态
            if (state.nextIndexToLoad >= state.pageTasks.length) {
                updateStatus('✅ 全部加载完成');
            } else {
                updateStatus(`📥 已加载 ${state.nextIndexToLoad}/${state.pageTasks.length} 页，继续滚动查看更多`);
            }

            // 检查是否需要继续加载
            setTimeout(lazyLoadCheck, 100);
        } catch (error) {
            console.error(`加载第${page}页失败:`, error);
            updateStatus(`❌ 第${page}页加载失败，尝试下一页`);
            state.nextIndexToLoad = currentIndex + 1;
            setTimeout(lazyLoadCheck, 100);
        } finally {
            state.isLoading = false;
        }
    }

    // ========== 滚动监听设置 ==========
    function setupLazyLoad() {
        if (state.scrollHandler) {
            window.removeEventListener('scroll', state.scrollHandler);
        }

        state.scrollHandler = lazyLoadCheck;
        window.addEventListener('scroll', state.scrollHandler, { passive: true });
        
        // 立即检查一次
        setTimeout(lazyLoadCheck, 100);
    }

    function removeLazyLoad() {
        if (state.scrollHandler) {
            window.removeEventListener('scroll', state.scrollHandler);
            state.scrollHandler = null;
        }
    }

    // ========== 状态重置 ==========
    function resetState() {
        state.originalImages = {};
        state.autoLayers = {};
        state.pageTasks = [];
        state.loadedPages.clear();
        state.nextIndexToLoad = 0;
        state.isLoading = false;
        
        dom.gallery.innerHTML = '';
        removeLazyLoad();
    }

    // ========== 预加载分割层数 ==========
    async function preloadLayers(pages) {
        updateStatus('⚙️ 正在预计算分割层数...');
        
        // 分批预加载，避免过多并发请求
        const BATCH_SIZE = 10;
        for (let i = 0; i < pages.length; i += BATCH_SIZE) {
            const batch = pages.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(page => fetchAutoLayer(state.currentJMId, page)));
        }
    }

    // ========== 主流程 ==========
    async function startProcessing() {
        const jmId = dom.jmId.value.trim();

        if (!jmId) {
            alert('请输入JM号');
            return;
        }

        if (isNaN(jmId) || parseInt(jmId) < 1) {
            alert('JM号必须是有效的正整数');
            return;
        }

        // 获取选中的CDN
        state.currentCDN = dom.cdnSelect.value;
        state.currentJMId = jmId;

        // 重置状态
        resetState();
        setLoading(true);
        updateStatus('🚀 启动中...');

        try {
            // 1. 检测所有页码
            const pages = await detectAllPages(state.currentCDN, state.currentJMId);

            if (pages.length === 0) {
                updateStatus('❌ 未找到任何图片，请尝试其他CDN');
                setLoading(false);
                return;
            }

            // 2. 保存页码
            state.pageTasks = pages;
            updateStatus(`📋 共找到 ${pages.length} 张图片`);

            // 3. 预加载分割层数（异步，不阻塞初始加载）
            preloadLayers(pages).catch(err => console.error('预加载层数失败:', err));

            // 4. 立即加载前几张图片
            const initialLoadCount = Math.min(CONFIG.INITIAL_LOAD_COUNT, pages.length);
            for (let i = 0; i < initialLoadCount; i++) {
                await loadNextPage();
            }

            // 5. 设置懒加载
            setupLazyLoad();

            updateStatus(`✅ 开始浏览 (${state.loadedPages.size}/${pages.length} 页)`);

        } catch (error) {
            console.error('处理失败:', error);
            updateStatus('❌ 出错: ' + error.message);
        } finally {
            setLoading(false);
        }
    }

    // ========== 事件绑定 ==========
    dom.startBtn.addEventListener('click', startProcessing);

    // 允许回车键触发加载
    dom.jmId.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            startProcessing();
        }
    });

    // 页面卸载时清理
    window.addEventListener('beforeunload', () => {
        removeLazyLoad();
    });

    // ========== 初始化 ==========
    function init() {
        initCDNSelect();
        updateStatus('');
    }

    init();

})();