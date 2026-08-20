// ==UserScript==
// @name         GoofishHelper
// @namespace    https://github.com/pipicat613/GoofishHelper
// @version      1.0.0
// @description  增强闲鱼体验，优化视觉体验、信用分析等
// @author       pipicat613
// @match        https://www.goofish.com/*
// @icon         https://www.goofish.com/favicon.ico
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';

    // 统一配置
    const DEFAULT_CONFIG = {
        showUserId: true,
        showConversion: true,
        showLevelTag: true,
        showDurationAlert: true,
        showRateAlert: true,
        showSoldAlert: true,
        analysis: {
            SELLER_RATIO: 0.1,
            OTHER_THRESHOLD: 0.01,
            MIN_REVIEWS_FOR_ANALYSIS: 50,
            SCROLL_DELAY: 613,
            MAX_SCROLL_LOOPS: 50,
            WEIGHT_TIME: 0.4,
            WEIGHT_IP: 0.3,
            WEIGHT_SOURCE: 0.1,
            WEIGHT_GOOD_RATE: 0.5,
            WEIGHT_HIGH_TIME: 0.4,
            WEIGHT_HIGH_IP: 0.2,
            WARN_SCORE_THRESHOLD: 60,
            WARN_GOOD_RATE: 0.95,
        }
    };

    let CONFIG = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    function loadConfig() {
        try {
            const saved = localStorage.getItem('goofish_enhancer_config_v2');
            if (saved) {
                const parsed = JSON.parse(saved);
                CONFIG = deepMerge(DEFAULT_CONFIG, parsed);
            }
        } catch (_) {}
    }

    function saveConfig() {
        try {
            localStorage.setItem('goofish_enhancer_config_v2', JSON.stringify(CONFIG));
        } catch (_) {}
    }

    function deepMerge(target, source) {
        const result = { ...target };
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }

    loadConfig();

    // 工具函数
    function findElementByPartial(parent, partialClass) {
        if (!parent) return null;
        return parent.querySelector(`[class*="${partialClass}"]`);
    }

    function extractNumber(text) {
        const match = text.match(/([\d.]+)/);
        return match ? parseFloat(match[1]) : 0;
    }

    function extractNumberWithUnit(text) {
        const match = text.match(/([\d.]+)\s*([年月天])/);
        if (match) return { num: parseFloat(match[1]), unit: match[2] };
        return { num: 0, unit: '' };
    }

    function formatDuration(days) {
        if (days >= 365) {
            const years = Math.floor(days / 365);
            const remain = days % 365;
            if (remain === 0) return `${years}年`;
            return `${years}年${remain}天`;
        }
        return `${Math.floor(days)}天`;
    }

    function showToast(message, duration = 2000) {
        const existing = document.querySelector('.enhancer-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'enhancer-toast';
        toast.style.cssText = `
            position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.75); color: #fff; padding: 8px 20px;
            border-radius: 6px; font-size: 14px; z-index: 999999;
            pointer-events: none; transition: opacity 0.3s;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    function debounce(fn, delay = 300) {
        let timer = null;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // 商品页功能
    const CONFIG_JSON = {
        levelTag: {
            excellent: { imgSuffix: '7448-2-tps', color: '#faad14', label: '信用优秀' },
            perfect: { imgSuffix: '3328-2-tps', color: null, label: '信用极好' },
            poor: { imgSuffix: '4506-2-tps', color: '#ff4d4f', label: '信用较差' },
            unknown: { color: '#faad14', label: '信用未知' }
        },
        sold: {
            thresholdLow: 10,
            colorLow: '#ff4d4f',
            thresholdHigh: 500,
            colorHigh: '#faad14'
        },
        duration: { warnColor: '#ff4d4f' },
        rate: { lowColor: '#ff4d4f', midColor: '#faad14' }
    };

    function showUserId() {
        if (!CONFIG.showUserId) return;
        const nickEl = findElementByPartial(document, 'item-user-info-nick');
        if (!nickEl) return;
        if (nickEl.querySelector('.enhancer-user-id')) return;

        let userId = null;
        const links = document.querySelectorAll('a[href*="personal?userId="]');
        for (const link of links) {
            const match = link.href.match(/userId=(\d+)/);
            if (match) { userId = match[1]; break; }
        }
        if (!userId) {
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const match = script.textContent.match(/userId["']?\s*[:=]\s*["']?(\d+)/);
                if (match) { userId = match[1]; break; }
            }
        }
        if (!userId) return;

        const idSpan = document.createElement('span');
        idSpan.className = 'enhancer-user-id';
        idSpan.style.cssText = `
            font-size: 12px; color: #999; margin-left: 8px;
            font-weight: normal; cursor: pointer; user-select: none;
            border-bottom: 1px dashed #ccc;
        `;
        idSpan.textContent = `(ID: ${userId})`;
        idSpan.title = '点击复制用户ID';
        idSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const copyText = userId;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(copyText).then(() => {
                    showToast(`已复制用户ID: ${copyText}`);
                }).catch(() => copyFallback(copyText));
            } else {
                copyFallback(copyText);
            }
        });
        nickEl.appendChild(idSpan);

        function copyFallback(text) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                showToast(`已复制用户ID: ${text}`);
            } catch (_) {
                showToast('复制失败');
            }
            document.body.removeChild(textarea);
        }
    }

    function showConversionRate() {
        if (!CONFIG.showConversion) return;
        const wantContainer = findElementByPartial(document, 'want');
        if (!wantContainer) return;
        if (wantContainer.querySelector('.enhancer-conversion')) return;

        let wantText = '', viewText = '';
        for (const child of wantContainer.children) {
            const text = child.textContent.trim();
            if (text.includes('人想要')) wantText = text;
            else if (text.includes('浏览')) viewText = text;
        }
        if (!wantText || !viewText) return;

        const wantNum = extractNumber(wantText);
        let viewNum = extractNumber(viewText);
        if (viewText.includes('万')) viewNum *= 10000;
        if (wantNum === 0 || viewNum === 0) return;

        const rate = (wantNum / viewNum) * 100;
        const rateStr = rate < 0.01 ? '<0.01' : rate.toFixed(2);

        const rateEl = document.createElement('span');
        rateEl.className = 'enhancer-conversion';
        rateEl.style.cssText = `font-size: 13px; color: #faad14; font-weight: 600; margin-right: 8px;`;
        rateEl.textContent = `转化率 ${rateStr}%`;
        wantContainer.insertBefore(rateEl, wantContainer.firstChild);
    }

    function showLevelTag() {
        if (!CONFIG.showLevelTag) return;
        const levelContainer = findElementByPartial(document, 'item-user-info-level');
        if (!levelContainer) return;
        if (levelContainer.querySelector('.enhancer-level-tag')) return;

        const imgs = levelContainer.querySelectorAll('img');
        if (imgs.length === 0) return;

        const { excellent, perfect, poor, unknown } = CONFIG_JSON.levelTag;
        let levelConfig = null;

        for (const img of imgs) {
            const src = img.src || '';
            if (src.includes(excellent.imgSuffix)) {
                levelConfig = excellent;
                break;
            } else if (src.includes(perfect.imgSuffix)) {
                levelConfig = perfect;
                break;
            } else if (src.includes(poor.imgSuffix)) {
                levelConfig = poor;
                break;
            }
        }
        if (!levelConfig) levelConfig = unknown;
        if (levelConfig.color === null) return;

        const tag = document.createElement('span');
        tag.className = 'enhancer-level-tag';
        tag.style.cssText = `
            font-size: 11px; color: #fff; background: ${levelConfig.color};
            border-radius: 10px; padding: 0 8px; line-height: 18px;
            margin-left: 6px; display: inline-block; font-weight: 500;
            vertical-align: middle;
        `;
        tag.textContent = levelConfig.label;
        levelContainer.appendChild(tag);
    }

    function processDuration() {
        if (!CONFIG.showDurationAlert) return;
        const labels = document.querySelectorAll('[class*="item-user-info-label--"]');
        for (const label of labels) {
            const text = label.textContent.trim();
            if (!text.includes('来闲鱼')) continue;
            if (label.dataset.enhancerProcessed === 'true') continue;

            const content = text.replace('来闲鱼', '').trim();
            const { num, unit } = extractNumberWithUnit(content);
            let days = 0, shouldWarn = false;

            if (unit === '年') {
                days = num * 365;
                if (num < 1) shouldWarn = true;
            } else if (unit === '月') {
                days = num * 30;
                shouldWarn = true;
            } else if (unit === '天') {
                days = num;
                if (days < 365) shouldWarn = true;
            } else {
                const numOnly = extractNumber(content);
                if (numOnly > 0) {
                    if (content.includes('年')) {
                        days = numOnly * 365;
                        if (numOnly < 1) shouldWarn = true;
                    } else if (content.includes('月')) {
                        days = numOnly * 30;
                        shouldWarn = true;
                    } else if (content.includes('天')) {
                        days = numOnly;
                        if (days < 365) shouldWarn = true;
                    }
                }
            }

            label.dataset.enhancerProcessed = 'true';

            if (shouldWarn && days > 0) {
                label.style.color = CONFIG_JSON.duration.warnColor;
                label.style.fontWeight = '600';
                if (!content.includes('天') && days > 0) {
                    const newText = `来闲鱼${formatDuration(days)}`;
                    const textNode = Array.from(label.childNodes).find(n => n.nodeType === 3);
                    if (textNode) textNode.textContent = newText;
                    else label.textContent = newText;
                }
            } else if (days > 0 && days < 365) {
                label.style.color = CONFIG_JSON.duration.warnColor;
                label.style.fontWeight = '600';
            }
        }
    }

    function processRate() {
        if (!CONFIG.showRateAlert) return;
        const labels = document.querySelectorAll('[class*="item-user-info-label--"]');
        for (const label of labels) {
            const text = label.textContent.trim();
            if (!text.includes('好评率')) continue;
            if (label.dataset.enhancerProcessed === 'true') continue;

            const num = extractNumber(text);
            if (num === 0) continue;

            label.dataset.enhancerProcessed = 'true';

            if (num < 95) {
                label.style.color = CONFIG_JSON.rate.lowColor;
                label.style.fontWeight = '600';
            } else if (num >= 95 && num < 100) {
                label.style.color = CONFIG_JSON.rate.midColor;
                label.style.fontWeight = '600';
            }
        }
    }

    function processSold() {
        if (!CONFIG.showSoldAlert) return;
        const labels = document.querySelectorAll('[class*="item-user-info-label--"]');
        for (const label of labels) {
            const text = label.textContent.trim();
            const match = text.match(/(?:卖出|已卖出)\s*(\d+)\s*件/);
            if (!match) continue;
            if (label.dataset.enhancerSoldProcessed === 'true') continue;

            const num = parseInt(match[1], 10);
            if (isNaN(num)) continue;

            label.dataset.enhancerSoldProcessed = 'true';

            const { thresholdLow, colorLow, thresholdHigh, colorHigh } = CONFIG_JSON.sold;
            if (num < thresholdLow) {
                label.style.color = colorLow;
                label.style.fontWeight = '600';
            } else if (num > thresholdHigh) {
                label.style.color = colorHigh;
                label.style.fontWeight = '600';
            }
        }
    }

    let isApplying = false;
    function applyProductFunctions() {
        if (isApplying) return;
        isApplying = true;
        try {
            showUserId();
            showConversionRate();
            showLevelTag();
            processDuration();
            processRate();
            processSold();
        } finally {
            isApplying = false;
        }
    }

    function fullRefresh() {
        if (isApplying) return;
        isApplying = true;
        try {
            document.querySelectorAll('.enhancer-user-id, .enhancer-conversion, .enhancer-level-tag')
                .forEach(el => el.remove());
            const labels = document.querySelectorAll('[class*="item-user-info-label--"]');
            labels.forEach(label => {
                delete label.dataset.enhancerProcessed;
                delete label.dataset.enhancerSoldProcessed;
                const colors = [
                    CONFIG_JSON.duration.warnColor,
                    CONFIG_JSON.rate.lowColor,
                    CONFIG_JSON.rate.midColor,
                    CONFIG_JSON.sold.colorLow,
                    CONFIG_JSON.sold.colorHigh
                ];
                if (colors.includes(label.style.color)) {
                    label.style.color = '';
                    label.style.fontWeight = '';
                }
            });
            applyProductFunctions();
        } finally {
            isApplying = false;
        }
    }

    const debouncedApply = debounce(applyProductFunctions, 300);

    // 卖家分析功能
    function convertSelector(selector) {
        return selector.replace(/\.([a-zA-Z][a-zA-Z0-9_-]*--)([a-zA-Z0-9_-]{0,3})[a-zA-Z0-9_-]*/g, function(match, prefix, suffix) {
            return '[class*="' + prefix + suffix + '"]';
        });
    }

    function $(selector, context) {
        const ctx = context || document;
        return ctx.querySelector(convertSelector(selector));
    }

    function $$(selector, context) {
        const ctx = context || document;
        return ctx.querySelectorAll(convertSelector(selector));
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getRateContainer() {
        return $('.rateList--');
    }

    function getRateItems() {
        const container = getRateContainer();
        if (!container) return [];
        return $$('.rateItem--', container);
    }

    function extractRegion(text) {
        if (!text) return null;
        let region = text.replace(/^中国/, '').trim();
        region = region.replace(/(省|市|自治区|特别行政区|行政区)$/, '');
        if (!region) region = text;
        return region;
    }

    function getRegionFromTimeIp(timeIpEl) {
        if (!timeIpEl) return null;
        const text = timeIpEl.textContent.trim();
        const parts = text.split(/\s+/);
        if (parts.length < 3) return null;
        let raw = parts[parts.length - 1];
        if (/^\d+$/.test(raw)) return null;
        return extractRegion(raw);
    }

    function getDateFromTimeIp(timeIpEl) {
        if (!timeIpEl) return null;
        const text = timeIpEl.textContent.trim();
        const match = text.match(/(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : null;
    }

    function getSellerLocation() {
        const infoCenter = $('.infoCenter--');
        if (!infoCenter) return '';
        const first = $('.infoCenterText--', infoCenter);
        if (!first) return '';
        return extractRegion(first.textContent.trim()) || '';
    }

    function getTotalReviewCount() {
        const lis = $$('.tab-- .li--');
        for (const li of lis) {
            if (!li.textContent.includes('信用及评价')) continue;
            const num = $('.num--', li);
            if (!num) continue;
            const n = parseInt(num.textContent.trim(), 10);
            return isNaN(n) ? 0 : n;
        }
        return 0;
    }

    function getFilterCategories() {
        const result = [];
        const tabs = $$('.filterTab-- .tabItem--');
        tabs.forEach(tab => {
            const text = tab.textContent.replace(/\s+/g, ' ').trim();
            const match = text.match(/^(.+?)\s*(\d+)\s*$/);
            if (match) {
                result.push({ label: match[1].trim(), count: parseInt(match[2], 10) || 0 });
            } else {
                result.push({ label: text, count: 0 });
            }
        });
        return result;
    }

    async function loadAllRates() {
        const analysisCfg = CONFIG.analysis;
        const tabs = $$('.tab-- .li--');
        if (tabs.length < 2) {
            throw new Error('未找到"信用及评价"标签');
        }

        let creditTab = null;
        for (const li of tabs) {
            if (li.textContent.includes('信用及评价')) {
                creditTab = li;
                break;
            }
        }
        if (!creditTab) creditTab = tabs[1];

        const isActive = $('.lineSelected--', creditTab);
        if (!isActive) {
            creditTab.click();
            await sleep(1500);
        }

        let prevCount = -1;
        let stableCount = 0;
        for (let i = 0; i < analysisCfg.MAX_SCROLL_LOOPS; i++) {
            const currentCount = getRateItems().length;
            if (currentCount === prevCount) {
                stableCount++;
                if (stableCount >= 2) break;
            } else {
                stableCount = 0;
                prevCount = currentCount;
            }
            scrollTo(0, document.body.scrollHeight);
            await sleep(analysisCfg.SCROLL_DELAY);
        }

        const foldEl = $('.foldableNum--');
        if (foldEl && foldEl.textContent.includes('已折叠')) {
            foldEl.click();
            await sleep(1200);

            prevCount = -1;
            stableCount = 0;
            for (let i = 0; i < analysisCfg.MAX_SCROLL_LOOPS; i++) {
                const currentCount = getRateItems().length;
                if (currentCount === prevCount) {
                    stableCount++;
                    if (stableCount >= 3) break;
                } else {
                    stableCount = 0;
                    prevCount = currentCount;
                }
                scrollTo(0, document.body.scrollHeight);
                await sleep(analysisCfg.SCROLL_DELAY);
            }
        }

        window.scrollTo(0, document.body.scrollHeight);
        await sleep(analysisCfg.SCROLL_DELAY);
        return getRateItems();
    }

    function analyzeRegions(items, sellerLocation) {
        const regionCount = {};
        let totalWithIP = 0;
        items.forEach(item => {
            const timeIp = $('.timeIp--', item);
            const region = getRegionFromTimeIp(timeIp);
            if (region) {
                regionCount[region] = (regionCount[region] || 0) + 1;
                totalWithIP++;
            }
        });

        const total = totalWithIP;
        if (total === 0) {
            return { total: 0, chartData: [], regionCount: {} };
        }

        let data = Object.entries(regionCount).map(([label, value]) => ({
            label,
            value,
            percent: (value / total) * 100
        }));

        let otherValue = 0;
        const mainData = [];
        const threshold = CONFIG.analysis.OTHER_THRESHOLD;
        data.forEach(item => {
            if (item.percent < threshold * 100) {
                otherValue += item.percent;
            } else {
                mainData.push(item);
            }
        });
        if (otherValue > 0) {
            mainData.push({
                label: '其他',
                value: Math.round((otherValue / 100) * total),
                percent: otherValue
            });
        }
        mainData.sort((a, b) => b.percent - a.percent);

        return { total, regionCount, chartData: mainData };
    }

    function analyzeTimes(items) {
        const dateCount = {};
        let total = 0;
        items.forEach(item => {
            if (!$('.rateItemCenter--', item)) return;
            const date = getDateFromTimeIp($('.timeIp--', item));
            if (!date) return;
            dateCount[date] = (dateCount[date] || 0) + 1;
            total++;
        });

        let maxDate = '';
        let maxCount = 0;
        Object.entries(dateCount).forEach(([date, count]) => {
            if (count > maxCount) {
                maxCount = count;
                maxDate = date;
            }
        });

        const maxPercent = total > 0 ? (maxCount / total) * 100 : 0;

        let data = Object.entries(dateCount).map(([date, count]) => ({
            label: date,
            value: count,
            percent: total > 0 ? (count / total) * 100 : 0
        }));

        let otherValue = 0;
        const mainData = [];
        const threshold = CONFIG.analysis.OTHER_THRESHOLD;
        data.forEach(item => {
            if (item.percent < threshold * 100) {
                otherValue += item.percent;
            } else {
                mainData.push(item);
            }
        });
        if (otherValue > 0) {
            mainData.push({
                label: '其他',
                value: Math.round((otherValue / 100) * total),
                percent: otherValue
            });
        }
        mainData.sort((a, b) => b.percent - a.percent);

        const sortedDates = data.sort((a, b) => b.value - a.value);

        return { total, dateCount, chartData: mainData, sortedDates, maxDate, maxCount, maxPercent };
    }

    function analyzeProportions(totalReviewCount, categories) {
        const map = {};
        categories.forEach(c => { map[c.label] = c.count; });

        const fromSeller = map['来自卖家'] || 0;
        const fromBuyer = map['来自买家'] || 0;
        const good = map['好评'] || 0;
        const bad = map['差评'] || 0;

        const sourceTotal = fromSeller + fromBuyer;
        const sourceData = [];
        if (fromSeller > 0) sourceData.push({ label: '来自卖家', value: fromSeller, percent: sourceTotal > 0 ? (fromSeller / sourceTotal) * 100 : 0 });
        if (fromBuyer > 0) sourceData.push({ label: '来自买家', value: fromBuyer, percent: sourceTotal > 0 ? (fromBuyer / sourceTotal) * 100 : 0 });

        const goodBadTotal = good + bad;
        const typeData = [];
        if (goodBadTotal > 0) {
            typeData.push({ label: '好评', value: good, percent: (good / goodBadTotal) * 100 });
            typeData.push({ label: '差评', value: bad, percent: (bad / goodBadTotal) * 100 });
        }

        const sellerPercent = totalReviewCount > 0 ? (fromSeller / totalReviewCount) * 100 : 0;
        const sellerWarning = totalReviewCount > 0 && sellerPercent < CONFIG.analysis.SELLER_RATIO * 100;
        const sellerWarningText = sellerWarning
            ? `卖家评价占比 ${sellerPercent.toFixed(1)}%，疑似职业卖家`
            : '';

        const goodRate = goodBadTotal > 0 ? good / goodBadTotal : 0;

        return {
            totalReviewCount,
            fromSeller,
            fromBuyer,
            sourceData,
            typeData,
            sellerPercent,
            sellerWarning,
            sellerWarningText,
            goodRate
        };
    }

    function calcTimeScore(timeAnalysis) {
        const dateCount = timeAnalysis.dateCount;
        const dates = Object.keys(dateCount);
        if (dates.length <= 1) return 0;
        const total = timeAnalysis.total;
        if (total === 0) return 0;

        const avg1 = total / dates.length;
        const highDates = dates.filter(date => dateCount[date] > avg1);
        if (highDates.length === 0) return 0;

        const sum2 = highDates.reduce((acc, date) => acc + dateCount[date], 0);
        const avg2 = sum2 / highDates.length;
        const max = Math.max(...Object.values(dateCount));

        if (avg2 === 0) return 0;
        const deviation = (max - avg2) * CONFIG.analysis.WEIGHT_HIGH_TIME / avg2;
        return Math.min(100, deviation * 100);
    }

    function calcIpScore(regionCount, totalReviewCount) {
        if (totalReviewCount === 0) return 0;
        const threshold = Math.floor(totalReviewCount * 0.01);
        const filtered = Object.entries(regionCount).filter(([region, count]) => count > threshold);
        if (filtered.length <= 1) return 0;
        const counts = filtered.map(([_, count]) => count);
        const total = counts.reduce((a, b) => a + b, 0);
        const avg = total / counts.length;
        const max = Math.max(...counts);
        if (avg === 0) return 0;
        const deviation = (max - avg) * CONFIG.analysis.WEIGHT_HIGH_IP / avg;
        return Math.min(100, deviation * 100);
    }

    function calcSourceScore(fromSeller, fromBuyer) {
        if (fromBuyer === 0) return 0;
        const ratio = fromSeller / fromBuyer;
        const risk = 100 * (1 / (1 + ratio / 0.25));
        return Math.min(100, risk);
    }

    function calcGoodRateScore(goodRate) {
        return (1 - goodRate) * 100;
    }

    const PIE_COLORS = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
        '#DDA0DD', '#F0A500', '#6C5B7B', '#F8A5C2', '#74B9FF',
        '#A29BFE', '#FD79A8', '#00CEC9', '#FDCB6E', '#E17055'
    ];

    function createPieChart(container, data) {
        container.style.cssText = 'position: relative; width: 100%; height: 280px;';

        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'width: 100%; height: 100%; display: block;';
        container.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        let width = 0, height = 0, centerX = 0, centerY = 0, radius = 0;

        let startAngle = -Math.PI / 2;
        const slices = data.map((item, index) => {
            const angle = (item.percent / 100) * 2 * Math.PI;
            const slice = {
                ...item,
                startAngle,
                endAngle: startAngle + angle,
                color: PIE_COLORS[index % PIE_COLORS.length]
            };
            startAngle += angle;
            return slice;
        });

        function draw(highlightIndex = -1) {
            ctx.clearRect(0, 0, width, height);
            slices.forEach((slice, idx) => {
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                if (slice.percent >= 99.99) {
                    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                } else {
                    ctx.arc(centerX, centerY, radius, slice.startAngle, slice.endAngle);
                }
                ctx.closePath();
                ctx.fillStyle = slice.color;
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = (idx === highlightIndex) ? 3 : 1.5;
                ctx.stroke();
            });
        }

        function resize() {
            const rect = container.getBoundingClientRect();
            width = rect.width || 600;
            height = rect.height || 280;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            centerX = width / 2;
            centerY = height / 2;
            radius = Math.min(width, height) * 0.42;
            draw();
        }

        const tooltip = document.createElement('div');
        tooltip.style.cssText = `
            position: absolute;
            background: rgba(0,0,0,0.82);
            color: #fff;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            pointer-events: none;
            display: none;
            z-index: 1000;
            white-space: nowrap;
        `;
        container.appendChild(tooltip);

        function findSlice(mx, my) {
            const dx = mx - centerX;
            const dy = my - centerY;
            if (Math.sqrt(dx * dx + dy * dy) > radius) return null;
            if (slices.length === 1) return slices[0];
            const normAngle = (Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI);
            for (const slice of slices) {
                const start = (slice.startAngle + 2 * Math.PI) % (2 * Math.PI);
                const end = (slice.endAngle + 2 * Math.PI) % (2 * Math.PI);
                if (start <= end) {
                    if (normAngle >= start && normAngle < end) return slice;
                } else {
                    if (normAngle >= start || normAngle < end) return slice;
                }
            }
            return null;
        }

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const slice = findSlice(mx, my);
            if (slice) {
                const idx = slices.indexOf(slice);
                tooltip.style.display = 'block';
                tooltip.style.left = (mx + 14) + 'px';
                tooltip.style.top = (my - 8) + 'px';
                tooltip.innerHTML = `<strong>${slice.label}</strong><br>${slice.value} 条 · ${slice.percent.toFixed(1)}%`;
                draw(idx);
            } else {
                tooltip.style.display = 'none';
                draw();
            }
        });

        canvas.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
            draw();
        });

        resize();
        window.addEventListener('resize', resize);

        let resizeObserver = null;
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => resize());
            resizeObserver.observe(container);
        }

        return {
            slices,
            destroy() {
                window.removeEventListener('resize', resize);
                if (resizeObserver) resizeObserver.disconnect();
                canvas.remove();
                tooltip.remove();
            }
        };
    }

    function makeSectionTitle(text) {
        const h = document.createElement('h4');
        h.textContent = text;
        h.style.cssText = 'margin: 0 0 10px 0; font-size: 16px;';
        return h;
    }

    function makeInfo(html) {
        const p = document.createElement('p');
        p.innerHTML = html;
        p.style.cssText = 'margin: 4px 0; font-size: 14px; color: #555;';
        return p;
    }

    function makeOk(text) {
        const div = document.createElement('div');
        div.style.cssText = `
            padding: 10px 14px;
            background: #d4edda;
            border-left: 4px solid #28a745;
            border-radius: 4px;
            margin: 8px 0;
            font-size: 14px;
        `;
        div.textContent = text;
        return div;
    }

    function makeWarning(text, type = 'red') {
        const div = document.createElement('div');
        const isYellow = type === 'yellow';
        div.style.cssText = `
            padding: 10px 14px;
            background: ${isYellow ? '#fffbe6' : '#fff1f0'};
            border-left: 4px solid ${isYellow ? '#faad14' : '#ff4d4f'};
            border-radius: 4px;
            margin: 8px 0;
            font-size: 14px;
            line-height: 1.6;
        `;
        div.textContent = text;
        return div;
    }

    function showResult(result) {
        const old = document.getElementById('xianyu-analyzer-result');
        if (old) old.remove();

        const { totalReviewCount, ipAnalysis, timeAnalysis, proportionAnalysis, allWarnings, scores, sellerLocation } = result;

        function exportDataFunc() {
            const exportData = {
                meta: {
                    totalReviewCount: totalReviewCount,
                    sellerLocation: sellerLocation || '未知',
                    exportTime: new Date().toISOString()
                },
                scores: scores,
                warnings: allWarnings.map(w => ({ text: w.text, type: w.type })),
                ipAnalysis: {
                    total: ipAnalysis.total,
                    chartData: ipAnalysis.chartData,
                    regionCount: ipAnalysis.regionCount
                },
                timeAnalysis: {
                    total: timeAnalysis.total,
                    chartData: timeAnalysis.chartData,
                    sortedDates: timeAnalysis.sortedDates,
                    maxDate: timeAnalysis.maxDate,
                    maxCount: timeAnalysis.maxCount,
                    maxPercent: timeAnalysis.maxPercent
                },
                proportionAnalysis: {
                    fromSeller: proportionAnalysis.fromSeller,
                    fromBuyer: proportionAnalysis.fromBuyer,
                    sourceData: proportionAnalysis.sourceData,
                    typeData: proportionAnalysis.typeData,
                    sellerPercent: proportionAnalysis.sellerPercent,
                    sellerWarning: proportionAnalysis.sellerWarning,
                    goodRate: proportionAnalysis.goodRate
                }
            };
            const json = JSON.stringify(exportData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `GoofishHelper_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        const overlay = document.createElement('div');
        overlay.id = 'xianyu-analyzer-result';
        overlay.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #fff;
            border-radius: 16px;
            box-shadow: 0 8px 40px rgba(0,0,0,0.3);
            z-index: 999999;
            width: 820px;
            max-width: 94vw;
            height: 560px;
            max-height: 85vh;
            overflow: hidden;
            font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
            color: #333;
            display: flex;
            flex-direction: column;
        `;

        const header = document.createElement('div');
        header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid #eee; flex-shrink: 0;';
        const title = document.createElement('h3');
        title.textContent = 'GoofishHelper - 信用分析';
        title.style.cssText = 'margin: 0; font-size: 18px;';

        const closeBtn = document.createElement('span');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'cursor: pointer; font-size: 22px; color: #999; padding: 0 4px;';
        closeBtn.onclick = () => overlay.remove();
        header.appendChild(title);
        header.appendChild(closeBtn);
        overlay.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = 'display: flex; flex: 1; min-height: 0;';
        overlay.appendChild(body);

        const sidebar = document.createElement('nav');
        sidebar.style.cssText = 'width: 150px; border-right: 1px solid #eee; padding: 12px 0; background: #fafafa; flex-shrink: 0;';
        body.appendChild(sidebar);

        const content = document.createElement('div');
        content.style.cssText = 'flex: 1; overflow-y: auto; padding: 16px 20px; min-width: 0;';
        body.appendChild(content);

        const panels = {};

        const riskPanel = document.createElement('div');
        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;';
        const titleH4 = document.createElement('h4');
        titleH4.textContent = '风险总览';
        titleH4.style.cssText = 'margin: 0; font-size: 16px;';
        titleRow.appendChild(titleH4);
        const exportBtnSmall = document.createElement('span');
        exportBtnSmall.textContent = '导出数据';
        exportBtnSmall.style.cssText = 'cursor: pointer; font-size: 14px; color: #000; user-select: none;';
        exportBtnSmall.addEventListener('click', (e) => {
            e.stopPropagation();
            exportDataFunc();
        });
        titleRow.appendChild(exportBtnSmall);
        riskPanel.appendChild(titleRow);

        const totalScore = scores.total;
        const level = totalScore < 30 ? '低' : (totalScore < 60 ? '中' : '高');
        const color = totalScore < 30 ? '#28a745' : (totalScore < 60 ? '#faad14' : '#ff4d4f');

        const scoreCard = document.createElement('div');
        scoreCard.style.cssText = `
            background: #f8f9fa;
            border-radius: 8px;
            padding: 16px 20px;
            margin: 8px 0 16px 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
        `;
        const left = document.createElement('div');
        left.innerHTML = `<span style="font-size: 16px; font-weight: 600;">综合风险评分</span>
                        <span style="font-size: 24px; font-weight: 700; color: ${color}; margin-left: 12px;">${totalScore.toFixed(0)}</span>
                        <span style="font-size: 16px; color: #666; margin-left: 8px;"> | 风险等级：<span style="font-weight:600;color:${color};">${level}</span></span>`;
        const right = document.createElement('div');
        right.style.cssText = 'display: flex; gap: 16px; font-size: 13px; color: #555; flex-wrap: wrap;';
        right.innerHTML = `
            <span>时间：<strong>${scores.time.toFixed(0)}</strong></span>
            <span>IP：<strong>${scores.ip.toFixed(0)}</strong></span>
            <span>来源：<strong>${scores.source.toFixed(0)}</strong></span>
            <span>差评：<strong>${scores.goodRate.toFixed(0)}</strong></span>
        `;
        scoreCard.appendChild(left);
        scoreCard.appendChild(right);
        riskPanel.appendChild(scoreCard);

        if (allWarnings.length > 0) {
            allWarnings.forEach(w => riskPanel.appendChild(makeWarning(w.text, w.type)));
        } else {
            riskPanel.appendChild(makeOk('未发现明显风险'));
        }
        panels.risk = riskPanel;

        const ipPanel = document.createElement('div');
        ipPanel.appendChild(makeSectionTitle('评价IP分析'));
        ipPanel.appendChild(makeInfo(`共解析 <strong>${ipAnalysis.total}</strong> 条含IP地区的评价`));
        if (ipAnalysis.chartData.length > 0) {
            const ipChart = document.createElement('div');
            ipPanel.appendChild(ipChart);
            requestAnimationFrame(() => createPieChart(ipChart, ipAnalysis.chartData));
        } else {
            ipPanel.appendChild(makeInfo('未提取到IP地区信息。'));
        }
        panels.ip = ipPanel;

        const timePanel = document.createElement('div');
        timePanel.appendChild(makeSectionTitle('评价时间分析'));
        timePanel.appendChild(makeInfo(`共解析 <strong>${timeAnalysis.total}</strong> 条带时间的评价`));
        if (timeAnalysis.chartData.length > 0) {
            const timeChart = document.createElement('div');
            timePanel.appendChild(timeChart);
            requestAnimationFrame(() => createPieChart(timeChart, timeAnalysis.chartData));
        } else {
            timePanel.appendChild(makeInfo('未提取到时间信息。'));
        }
        panels.time = timePanel;

        const sellerPanel = document.createElement('div');
        sellerPanel.appendChild(makeSectionTitle('职业卖家分析'));
        sellerPanel.appendChild(makeInfo(`评价总数：<strong>${totalReviewCount}</strong> 条`));
        if (proportionAnalysis.sellerWarning) {
            sellerPanel.appendChild(makeWarning(proportionAnalysis.sellerWarningText, 'yellow'));
        }
        const sourceChartContainer = document.createElement('div');
        sourceChartContainer.style.cssText = 'height: 260px; margin-top: 12px;';
        sellerPanel.appendChild(sourceChartContainer);
        if (proportionAnalysis.sourceData.length > 0) {
            requestAnimationFrame(() => createPieChart(sourceChartContainer, proportionAnalysis.sourceData));
        } else {
            sourceChartContainer.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">未获取到来源分类。</p>';
        }
        panels.seller = sellerPanel;

        const goodRatePanel = document.createElement('div');
        goodRatePanel.appendChild(makeSectionTitle('好评率分析'));
        const goodRate = proportionAnalysis.goodRate;
        goodRatePanel.appendChild(makeInfo(`好评率：<strong>${(goodRate * 100).toFixed(1)}%</strong>`));

        if (proportionAnalysis.typeData.length > 0) {
            const typeChartContainer = document.createElement('div');
            typeChartContainer.style.cssText = 'height: 260px; margin-top: 12px;';
            goodRatePanel.appendChild(typeChartContainer);
            requestAnimationFrame(() => createPieChart(typeChartContainer, proportionAnalysis.typeData));
        } else {
            goodRatePanel.appendChild(makeInfo('未获取到好评/差评数据（可能仅有中评或无评价）'));
        }
        panels.goodRate = goodRatePanel;

        const menuDefs = [
            { key: 'risk', label: '风险总览' },
            { key: 'ip', label: '评价IP分析' },
            { key: 'time', label: '评价时间分析' },
            { key: 'seller', label: '职业卖家分析' },
            { key: 'goodRate', label: '好评率分析' }
        ];

        let activeKey = 'risk';

        function renderPanel(key) {
            content.innerHTML = '';
            content.appendChild(panels[key]);
            sidebar.querySelectorAll('.xianyu-nav-item').forEach(el => {
                const on = el.dataset.key === key;
                el.style.background = on ? '#fff' : 'transparent';
                el.style.color = on ? '#ffd44d' : '#000';
                el.style.borderLeftColor = on ? '#ffd44d' : 'transparent';
                el.style.fontWeight = on ? '600' : 'normal';
            });
        }

        menuDefs.forEach(def => {
            const item = document.createElement('div');
            item.className = 'xianyu-nav-item';
            item.dataset.key = def.key;
            item.textContent = def.label;
            item.style.cssText = `
                padding: 11px 16px;
                cursor: pointer;
                font-size: 14px;
                color: #555;
                border-left: 3px solid transparent;
                transition: color 0.15s;
            `;
            item.addEventListener('mouseenter', () => {
                if (item.dataset.key !== activeKey) item.style.background = '#f0f0f0';
            });
            item.addEventListener('mouseleave', () => {
                if (item.dataset.key !== activeKey) item.style.background = 'transparent';
            });
            item.addEventListener('click', () => {
                activeKey = item.dataset.key;
                renderPanel(activeKey);
            });
            sidebar.appendChild(item);
        });

        renderPanel('risk');
        document.body.appendChild(overlay);
    }

    async function analyze() {
        try {
            const items = await loadAllRates();
            const totalReviewCount = getTotalReviewCount();
            const sellerLocation = getSellerLocation();
            const categories = getFilterCategories();

            if (items.length === 0 && totalReviewCount === 0) {
                alert('未加载到任何评价，请检查页面是否已登录或有评价。');
                return;
            }

            const ipAnalysis = analyzeRegions(items, sellerLocation);
            const timeAnalysis = analyzeTimes(items);
            const proportionAnalysis = analyzeProportions(totalReviewCount, categories);

            const timeScore = calcTimeScore(timeAnalysis);
            const ipScore = calcIpScore(ipAnalysis.regionCount, totalReviewCount);
            const sourceScore = calcSourceScore(proportionAnalysis.fromSeller, proportionAnalysis.fromBuyer);
            const goodRateScore = calcGoodRateScore(proportionAnalysis.goodRate);

            const totalScore = timeScore * CONFIG.analysis.WEIGHT_TIME +
                               ipScore * CONFIG.analysis.WEIGHT_IP +
                               sourceScore * CONFIG.analysis.WEIGHT_SOURCE +
                               goodRateScore * CONFIG.analysis.WEIGHT_GOOD_RATE;

            const scores = {
                time: timeScore,
                ip: ipScore,
                source: sourceScore,
                goodRate: goodRateScore,
                total: totalScore
            };

            const allWarnings = [];
            if (totalReviewCount < CONFIG.analysis.MIN_REVIEWS_FOR_ANALYSIS) {
                allWarnings.push({ text: '评论过少，分析不一定准确！', type: 'yellow' });
            }
            if (timeScore > CONFIG.analysis.WARN_SCORE_THRESHOLD) {
                allWarnings.push({
                    text: `评价时间过于集中，疑似刷评行为`,
                    type: 'red'
                });
            }
            if (ipScore > CONFIG.analysis.WARN_SCORE_THRESHOLD) {
                let warningText = `IP地区异常集中，疑似刷评行为`;
                let topRegion = null;
                if (ipAnalysis.chartData && ipAnalysis.chartData.length > 0) {
                    topRegion = ipAnalysis.chartData[0].label;
                }
                if (topRegion && sellerLocation) {
                    const normalize = s => s.replace(/\s+/g, '').toLowerCase();
                    const isSame = normalize(topRegion) === normalize(sellerLocation);
                    warningText += `，高频IP地区 ${topRegion} 与卖家所在地 ${sellerLocation} ${isSame ? '相同' : '不相同'}`;
                } else if (topRegion && !sellerLocation) {
                    warningText += `，但未能获取卖家所在地`;
                }
                allWarnings.push({
                    text: warningText,
                    type: 'red'
                });
            }
            if (proportionAnalysis.sellerWarning) {
                allWarnings.push({ text: proportionAnalysis.sellerWarningText, type: 'yellow' });
            }
            if (proportionAnalysis.goodRate < CONFIG.analysis.WARN_GOOD_RATE && proportionAnalysis.typeData.length > 0) {
                allWarnings.push({
                    text: `好评率为 ${(proportionAnalysis.goodRate * 100).toFixed(1)}%，差评占比较高`,
                    type: 'red'
                });
            }

            showResult({
                totalReviewCount,
                ipAnalysis,
                timeAnalysis,
                proportionAnalysis,
                allWarnings,
                scores,
                sellerLocation
            });
        } catch (err) {
            alert('分析出错：' + err.message);
            console.error(err);
        }
    }

    function addAnalyzeButton() {
        const operateDiv = $('.operate--');
        if (!operateDiv) {
            setTimeout(addAnalyzeButton, 1000);
            return;
        }
        if (document.getElementById('xianyu-analyze-btn')) return;

        const btn = document.createElement('div');
        btn.id = 'xianyu-analyze-btn';
        btn.className = 'selectNone--skBcLEr1 button--IxUWAGt8 yellowBtn--T8be5lvf';
        btn.style.cssText = 'width: 96px; height: 40px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;';
        btn.innerHTML = '<div class="btnChildren--KNQ6uqEf">分析</div>';

        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            btn.style.opacity = '0.6';
            btn.style.pointerEvents = 'none';
            await analyze();
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        });

        const firstChild = operateDiv.firstChild;
        if (firstChild) {
            operateDiv.insertBefore(btn, firstChild);
        } else {
            operateDiv.appendChild(btn);
        }
    }

    // ===================== 设置悬浮窗（居中，左侧导航） =====================
    let settingsModal = null;
    let settingsVisible = false;

    function createSettingsWindow() {
        if (settingsModal) return;

        const overlay = document.createElement('div');
        overlay.className = 'enhancer-settings-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.35);
            z-index: 999999;
            display: none;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(2px);
        `;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) hideSettings();
        });
        document.body.appendChild(overlay);

        const modal = document.createElement('div');
        modal.className = 'enhancer-settings-modal';
        modal.style.cssText = `
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.25);
            width: 720px;
            max-width: 94vw;
            height: 500px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
            position: relative;
        `;
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 14px 20px;
            border-bottom: 1px solid #e8e8e8;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        `;
        const title = document.createElement('span');
        title.textContent = 'GoofishHelper - 设置';
        title.style.cssText = 'font-size: 18px; font-weight: 600; color: #1a1a1a;';
        const closeBtn = document.createElement('span');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'cursor: pointer; font-size: 22px; color: #999; padding: 0 6px;';
        closeBtn.addEventListener('click', hideSettings);
        header.appendChild(title);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = 'display: flex; flex: 1; min-height: 0;';
        modal.appendChild(body);

        const nav = document.createElement('nav');
        nav.style.cssText = `
            width: 140px;
            border-right: 1px solid #e8e8e8;
            background: #fafafa;
            padding: 12px 0;
            flex-shrink: 0;
            overflow-y: auto;
        `;
        body.appendChild(nav);

        const content = document.createElement('div');
        content.style.cssText = `
            flex: 1;
            padding: 16px 20px;
            overflow-y: auto;
            background: #fff;
        `;
        body.appendChild(content);

        function createAboutPanel() {
            const div = document.createElement('div');
            div.innerHTML = `
                <p style="margin: 8px 0; font-size: 14px; color: #000;"><strong>GoofishHelper</strong> v1.0.0</p>
                <div style="display: flex; align-items: center; gap: 6px; font-size: 14px; color: #333; flex-wrap: wrap;">
                    <span>by pipicat613</span>
                    <span>|</span>
                    <a href="https://github.com/pipicat613/GoofishHelper" target="_blank" style="color: #333; text-decoration: none; font-weight: 500;">GitHub</a>
                </div>
                <p style="margin: 8px 0; font-size: 14px; color: #555;">功能：</p>
                <ul style="margin: 4px 0 12px 20px; font-size: 14px; color: #555; line-height: 1.8;">
                    <li>商品页显示用户ID、转化率、信用等级标记，时长、好评率、卖出件数预警</li>
                    <li>个人页卖家信用分析，通过IP、时间、来源、好评率多维度分析</li>
                </ul>
            `;
            return div;
        }

        function createProductPanel() {
            const div = document.createElement('div');
            div.innerHTML = `
                <h3 style="margin: 0 0 12px 0; font-size: 16px;">商品页警告设置</h3>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; font-size: 14px;">
                        <span>显示用户ID</span>
                        <input type="checkbox" class="enhancer-toggle" data-key="showUserId" ${CONFIG.showUserId ? 'checked' : ''} style="width:18px;height:18px;accent-color:#ffe60f;cursor:pointer;">
                    </label>
                    <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; font-size: 14px;">
                        <span>显示转化率</span>
                        <input type="checkbox" class="enhancer-toggle" data-key="showConversion" ${CONFIG.showConversion ? 'checked' : ''} style="width:18px;height:18px;accent-color:#ffe60f;cursor:pointer;">
                    </label>
                    <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; font-size: 14px;">
                        <span>信用等级额外标记</span>
                        <input type="checkbox" class="enhancer-toggle" data-key="showLevelTag" ${CONFIG.showLevelTag ? 'checked' : ''} style="width:18px;height:18px;accent-color:#ffe60f;cursor:pointer;">
                    </label>
                    <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; font-size: 14px;">
                        <span>时长预警</span>
                        <input type="checkbox" class="enhancer-toggle" data-key="showDurationAlert" ${CONFIG.showDurationAlert ? 'checked' : ''} style="width:18px;height:18px;accent-color:#ffe60f;cursor:pointer;">
                    </label>
                    <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; font-size: 14px;">
                        <span>好评率预警</span>
                        <input type="checkbox" class="enhancer-toggle" data-key="showRateAlert" ${CONFIG.showRateAlert ? 'checked' : ''} style="width:18px;height:18px;accent-color:#ffe60f;cursor:pointer;">
                    </label>
                    <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; font-size: 14px;">
                        <span>卖出件数预警</span>
                        <input type="checkbox" class="enhancer-toggle" data-key="showSoldAlert" ${CONFIG.showSoldAlert ? 'checked' : ''} style="width:18px;height:18px;accent-color:#ffe60f;cursor:pointer;">
                    </label>
                </div>
                <div style="margin-top: 16px; display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="enhancer-settings-reset" style="padding:6px 14px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:#000;cursor:pointer;font-size:13px;">恢复默认</button>
                    <button class="enhancer-settings-save" style="padding:6px 20px;border:none;border-radius:6px;background:#ffe60f;color:#000;cursor:pointer;font-size:13px;font-weight:500;">保存</button>
                </div>
            `;

            const toggles = div.querySelectorAll('.enhancer-toggle');
            toggles.forEach(t => {
                t.addEventListener('change', () => {
                    const key = t.dataset.key;
                    CONFIG[key] = t.checked;
                    saveConfig();
                });
            });

            div.querySelector('.enhancer-settings-reset').addEventListener('click', () => {
                toggles.forEach(t => t.checked = true);
                toggles.forEach(t => {
                    const key = t.dataset.key;
                    CONFIG[key] = true;
                });
                saveConfig();
                fullRefresh();
                showToast('已恢复默认设置');
            });

            div.querySelector('.enhancer-settings-save').addEventListener('click', () => {
                fullRefresh();
                showToast('设置已保存');
            });

            return div;
        }

        function createAnalysisPanel() {
            const div = document.createElement('div');
            div.innerHTML = `
                <h3 style="margin: 0 0 12px 0; font-size: 16px;">卖家分析参数</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; font-size: 13px;">
                    ${createInput('SELLER_RATIO', '卖家评价占比阈值', 0.01, 1, 0.01)}
                    ${createInput('OTHER_THRESHOLD', '其他分类上限', 0.001, 0.1, 0.001)}
                    ${createInput('MIN_REVIEWS_FOR_ANALYSIS', '最少评价数', 10, 200, 1)}
                    ${createInput('SCROLL_DELAY', '滚动延迟(ms)', 100, 2000, 10)}
                    ${createInput('MAX_SCROLL_LOOPS', '最大滚动次数', 10, 100, 1)}
                    ${createInput('WEIGHT_TIME', '时间权重', 0, 1, 0.05)}
                    ${createInput('WEIGHT_IP', 'IP权重', 0, 1, 0.05)}
                    ${createInput('WEIGHT_SOURCE', '来源权重', 0, 1, 0.05)}
                    ${createInput('WEIGHT_GOOD_RATE', '好评率权重', 0, 1, 0.05)}
                    ${createInput('WEIGHT_HIGH_TIME', '时间峰值权重', 0, 1, 0.05)}
                    ${createInput('WEIGHT_HIGH_IP', 'IP峰值权重', 0, 1, 0.05)}
                    ${createInput('WARN_SCORE_THRESHOLD', '警告分数阈值', 10, 100, 1)}
                    ${createInput('WARN_GOOD_RATE', '好评率警告阈值', 0.5, 1, 0.01)}
                </div>
                <div style="margin-top: 16px; display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="analysis-reset" style="padding:6px 14px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:#000;cursor:pointer;font-size:13px;">恢复默认</button>
                    <button class="analysis-save" style="padding:6px 20px;border:none;border-radius:6px;background:#ffe60f;color:#000;cursor:pointer;font-size:13px;font-weight:500;">保存</button>
                </div>
            `;

            function createInput(key, label, min, max, step) {
                const val = CONFIG.analysis[key] !== undefined ? CONFIG.analysis[key] : '';
                return `
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <label style="color: #555;">${label}</label>
                        <input type="number" class="analysis-input" data-key="${key}" value="${val}" min="${min}" max="${max}" step="${step}" style="padding:4px 6px; border:1px solid #ddd; border-radius:4px; font-size:13px; width:100%; box-sizing:border-box;">
                    </div>
                `;
            }

            const inputs = div.querySelectorAll('.analysis-input');
            div.querySelector('.analysis-save').addEventListener('click', () => {
                inputs.forEach(inp => {
                    const key = inp.dataset.key;
                    let val = parseFloat(inp.value);
                    if (!isNaN(val)) {
                        CONFIG.analysis[key] = val;
                    }
                });
                saveConfig();
                showToast('分析参数已保存');
            });

            div.querySelector('.analysis-reset').addEventListener('click', () => {
                inputs.forEach(inp => {
                    const key = inp.dataset.key;
                    const def = DEFAULT_CONFIG.analysis[key];
                    if (def !== undefined) {
                        inp.value = def;
                        CONFIG.analysis[key] = def;
                    }
                });
                saveConfig();
                showToast('已恢复默认分析参数');
            });

            return div;
        }

        const panels = {
            about: createAboutPanel(),
            product: createProductPanel(),
            analysis: createAnalysisPanel()
        };

        let currentTab = 'about';

        function switchTab(key) {
            currentTab = key;
            nav.querySelectorAll('.enhancer-nav-item').forEach(el => {
                const active = el.dataset.key === key;
                el.style.background = active ? '#fff' : 'transparent';
                el.style.color = active ? '#ffd44d' : '#000';
                el.style.borderLeftColor = active ? '#ffd44d' : 'transparent';
                el.style.fontWeight = active ? '600' : 'normal';
            });
            if (key === 'product') {
                panels.product = createProductPanel();
            } else if (key === 'analysis') {
                panels.analysis = createAnalysisPanel();
            } else {
                panels.about = createAboutPanel();
            }
            content.innerHTML = '';
            content.appendChild(panels[key]);
        }

        const tabs = [
            { key: 'about', label: '关于' },
            { key: 'product', label: '商品页警告' },
            { key: 'analysis', label: '卖家分析' }
        ];
        tabs.forEach(tab => {
            const item = document.createElement('div');
            item.className = 'enhancer-nav-item';
            item.dataset.key = tab.key;
            item.textContent = tab.label;
            item.style.cssText = `
                padding: 10px 16px;
                cursor: pointer;
                font-size: 14px;
                color: #000;
                border-left: 3px solid transparent;
                transition: all 0.15s;
                user-select: none;
            `;
            item.addEventListener('mouseenter', () => {
                if (item.dataset.key !== currentTab) item.style.background = '#f0f0f0';
            });
            item.addEventListener('mouseleave', () => {
                if (item.dataset.key !== currentTab) item.style.background = 'transparent';
            });
            item.addEventListener('click', () => switchTab(tab.key));
            nav.appendChild(item);
        });

        switchTab('about');

        modal._panels = panels;
        modal._switchTab = switchTab;
        modal._overlay = overlay;
        settingsModal = modal;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    function showSettings() {
        if (!settingsModal) createSettingsWindow();
        settingsModal._overlay.style.display = 'flex';
        settingsVisible = true;
        const activeNav = settingsModal.querySelector('.enhancer-nav-item[style*="color: rgb(255, 106, 0)"]');
        const currentKey = activeNav ? activeNav.dataset.key : 'about';
        settingsModal._switchTab(currentKey);
    }

    function hideSettings() {
        if (settingsModal) {
            settingsModal._overlay.style.display = 'none';
        }
        settingsVisible = false;
    }

    function toggleSettings() {
        if (settingsVisible) {
            hideSettings();
        } else {
            showSettings();
        }
    }

    // 侧边栏按钮
    function createSidebarButton() {
        if (document.querySelector('.enhancer-sidebar-btn')) return true;

        const container = document.querySelector('[class*="sidebar-item-container--"]');
        if (!container) return false;

        let visibleGroup = null;
        for (const child of container.children) {
            if (child.style.display === 'block') {
                visibleGroup = child;
                break;
            }
        }
        if (!visibleGroup) return false;

        const existingItem = visibleGroup.querySelector('a[class*="sidebar-item-wrap--"]');
        if (!existingItem) return false;

        const divider = document.createElement('div');
        divider.className = 'sidebar-item-divider';

        const newItem = existingItem.cloneNode(true);
        newItem.onclick = null;
        newItem.href = 'javascript:void(0);';
        newItem.removeAttribute('data-spm-anchor-id');

        const textContainer = newItem.querySelector('[class*="sidebar-item-text-container--"]');
        if (textContainer) textContainer.textContent = '设置';

        const img = newItem.querySelector('img');
        if (img) {
            img.src = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="#1f1f1f"><path d="m388-80-20-126q-19-7-40-19t-37-25l-118 54-93-164 108-79q-2-9-2.5-20.5T185-480q0-9 .5-20.5T188-521L80-600l93-164 118 54q16-13 37-25t40-18l20-127h184l20 126q19 7 40.5 18.5T669-710l118-54 93 164-108 77q2 10 2.5 21.5t.5 21.5q0 10-.5 21t-2.5 21l108 78-93 164-118-54q-16 13-36.5 25.5T592-206L572-80H388Zm48-60h88l14-112q33-8 62.5-25t53.5-41l106 46 40-72-94-69q4-17 6.5-33.5T715-480q0-17-2-33.5t-7-33.5l94-69-40-72-106 46q-23-26-52-43.5T538-708l-14-112h-88l-14 112q-34 7-63.5 24T306-642l-106-46-40 72 94 69q-4 17-6.5 33.5T245-480q0 17 2.5 33.5T254-413l-94 69 40 72 106-46q24 24 53.5 41t62.5 25l14 112Zm44-210q54 0 92-38t38-92q0-54-38-92t-92-38q-54 0-92 38t-38 92q0 54 38 92t92 38Zm0-130Z"/></svg>`);
            img.style.width = '';
            img.style.height = '';
        }

        newItem.addEventListener('click', function(e) {
            e.preventDefault();
            toggleSettings();
        });

        const allItems = visibleGroup.querySelectorAll('a[class*="sidebar-item-wrap--"]');
        let lastItem = allItems[allItems.length - 1];
        const lastText = lastItem ? lastItem.querySelector('[class*="sidebar-item-text-container--"]')?.textContent.trim() : '';

        if (lastText === '回顶部') {
            visibleGroup.insertBefore(divider, lastItem);
            visibleGroup.insertBefore(newItem, lastItem);
        } else {
            visibleGroup.appendChild(divider);
            visibleGroup.appendChild(newItem);
        }

        newItem.classList.add('enhancer-sidebar-btn');
        return true;
    }

    // 初始化
    function init() {
        createSettingsWindow();

        // 所有页面插入侧边栏按钮
        if (!createSidebarButton()) {
            const sidebarObserver = new MutationObserver(() => {
                if (createSidebarButton()) {
                    sidebarObserver.disconnect();
                }
            });
            sidebarObserver.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                if (!document.querySelector('.enhancer-sidebar-btn')) {
                    createSidebarButton();
                }
            }, 5000);
        }

        // 商品页功能
        if (window.location.href.includes('/item')) {
            setTimeout(applyProductFunctions, 500);
            const observer = new MutationObserver(() => {
                const nick = findElementByPartial(document, 'item-user-info-nick');
                const want = findElementByPartial(document, 'want');
                if (nick || want) {
                    debouncedApply();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setInterval(() => {
                const nick = findElementByPartial(document, 'item-user-info-nick');
                const want = findElementByPartial(document, 'want');
                if (nick || want) {
                    const hasEnhancer = document.querySelector('.enhancer-user-id, .enhancer-conversion, .enhancer-level-tag');
                    if (!hasEnhancer) {
                        applyProductFunctions();
                    }
                }
            }, 10000);
        }

        // 个人页分析按钮
        if (window.location.href.includes('/personal')) {
            addAnalyzeButton();
            let lastUrl = location.href;
            new MutationObserver(() => {
                if (location.href !== lastUrl) {
                    lastUrl = location.href;
                    setTimeout(addAnalyzeButton, 1000);
                }
            }).observe(document, { subtree: true, childList: true });
        }

        window.__goofishEnhancer = {
            CONFIG,
            fullRefresh,
            toggleSettings,
            analyze
        };

        console.log('GH OK!');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();