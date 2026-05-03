/**
 * JM图片分割层数计算器 - JavaScript库
 * 依赖: md5.min.js
 */
(function(global) {
    'use strict';

    /**
     * 计算JM图片的分割层数
     * @param {number|string} jmId - JM号
     * @param {number|string} imgIndex - 图片序号
     * @param {string|null} providedMd5 - 可选的MD5值（32位字符串），不提供则自动计算
     * @returns {Object} 计算结果对象
     * @throws {Error} 参数无效时抛出错误
     */
    function calculateLayers(jmId, imgIndex, providedMd5) {
        // 参数验证和转换
        jmId = parseInt(jmId, 10);
        imgIndex = parseInt(imgIndex, 10);

        if (isNaN(jmId) || jmId < 1) {
            throw new Error('JM号必须是大于0的整数');
        }
        if (isNaN(imgIndex) || imgIndex < 1) {
            throw new Error('图片序号必须是大于0的整数');
        }

        // 格式化图片序号为5位
        var imgStr = String(imgIndex).padStart(5, '0');
        
        // 拼接字符串
        var combined = String(jmId) + imgStr;
        
        // 获取MD5
        var md5Result;
        if (providedMd5 && typeof providedMd5 === 'string' && providedMd5.length === 32) {
            md5Result = providedMd5.toUpperCase();
        } else {
            // 使用 md5.min.js 提供的 md5() 函数
            if (typeof global.md5 !== 'function') {
                throw new Error('MD5库未加载，请先引入md5.min.js');
            }
            md5Result = global.md5(combined).toUpperCase();
        }
        
        // 取最后一个字符
        var lastChar = md5Result.charAt(md5Result.length - 1);
        
        // 获取ASCII码
        var ascii = lastChar.charCodeAt(0);
        
        // 判断JM号范围并计算取模结果
        var modResult = null;
        var rangeInfo = '';
        
        if (jmId >= 268850 && jmId <= 421925) {
            modResult = ascii % 10;
            rangeInfo = jmId + ' 在范围 268850~421925，取模10';
        } else if (jmId >= 421926) {
            modResult = ascii % 8;
            rangeInfo = jmId + ' >= 421926，取模8';
        } else {
            rangeInfo = jmId + ' < 268850，不取模';
        }
        
        // 计算层数
        var layers;
        if (modResult !== null) {
            layers = 2 * (modResult + 1);
        } else {
            layers = 10;
        }
        
        // 返回计算结果
        return {
            combined: combined,
            md5: md5Result,
            lastChar: lastChar,
            ascii: ascii,
            rangeInfo: rangeInfo,
            modResult: modResult,
            layers: layers
        };
    }

    /**
     * 从合并字符串中解析JM号和图片序号
     * @param {string} combinedStr - 合并字符串，如 "42687100001"
     * @returns {Object} { jmId, imgIndex }
     * @throws {Error} 格式无效时抛出错误
     */
    function parseCombinedString(combinedStr) {
        if (!combinedStr || typeof combinedStr !== 'string') {
            throw new Error('请输入合并字符串');
        }
        if (!/^\d+$/.test(combinedStr)) {
            throw new Error('合并字符串只能包含数字');
        }
        if (combinedStr.length < 6) {
            throw new Error('合并字符串长度至少为6位（至少1位JM号 + 5位图片序号）');
        }
        
        var imgIndex = combinedStr.slice(-5);
        var jmId = combinedStr.slice(0, -5);
        
        return {
            jmId: parseInt(jmId, 10),
            imgIndex: parseInt(imgIndex, 10)
        };
    }

    /**
     * 从分开的参数计算层数
     * @param {number|string} jmId - JM号
     * @param {number|string} imgIndex - 图片序号
     * @param {string|null} md5 - 可选的MD5值
     * @returns {Object} 计算结果对象
     */
    function calculateFromSeparate(jmId, imgIndex, md5) {
        return calculateLayers(jmId, imgIndex, md5);
    }

    /**
     * 从合并字符串计算层数
     * @param {string} combinedStr - 合并字符串
     * @param {string|null} md5 - 可选的MD5值
     * @returns {Object} 计算结果对象
     */
    function calculateFromCombined(combinedStr, md5) {
        var parsed = parseCombinedString(combinedStr);
        return calculateLayers(parsed.jmId, parsed.imgIndex, md5);
    }

    /**
     * 预计算一系列页码的分割层数（用于批量处理）
     * @param {number|string} jmId - JM号
     * @param {Array<number>} pages - 页码数组
     * @param {string|null} md5 - 可选MD5（如果提供，所有页码使用相同MD5）
     * @returns {Object} 页码为键、层数为值的对象
     */
    function batchCalculate(jmId, pages, md5) {
        var results = {};
        for (var i = 0; i < pages.length; i++) {
            var result = calculateLayers(jmId, pages[i], md5);
            results[pages[i]] = result.layers;
        }
        return results;
    }

    // 导出API
    var LayersCalculator = {
        calculate: calculateLayers,
        fromSeparate: calculateFromSeparate,
        fromCombined: calculateFromCombined,
        parseCombined: parseCombinedString,
        batch: batchCalculate,
        version: '1.0.0'
    };

    // 支持多种模块系统
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = LayersCalculator;
    } else if (typeof define === 'function' && define.amd) {
        define(function() { return LayersCalculator; });
    } else {
        global.LayersCalculator = LayersCalculator;
    }

})(typeof window !== 'undefined' ? window : this);