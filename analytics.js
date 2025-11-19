// ==================================================================
// ANALYTICS MODULE: Trends, Burndown, Velocity
// ==================================================================

let currentMainTab = 'metrics';
let trendChartInstances = {};
let sprintChartInstances = {};

// ==================================================================
// MAIN TAB SWITCHING
// ==================================================================

function switchMainTab(tabName) {
    currentMainTab = tabName;
    window.currentMainTab = tabName; // Also export to window
    
    // Update tab buttons
    document.querySelectorAll('.main-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        }
    });
    
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab
    if (tabName === 'metrics') {
        document.getElementById('metricsTab').classList.add('active');
    } else if (tabName === 'trends') {
        document.getElementById('trendsTab').classList.add('active');
        // Copy filter tags to trends tab
        updateTrendsFilters();
        // Render trends
        renderTrends();
    } else if (tabName === 'math') {
        document.getElementById('mathTab').classList.add('active');
    }
    
    // Handle TOC visibility based on active tab
    const tocNav = document.getElementById('tocNav');
    if (tocNav) {
        if (tabName === 'metrics') {
            // Show TOC on Metrics tab
            tocNav.classList.remove('hidden');
            // Update TOC structure and highlighting
            if (typeof window.buildTOCStructure === 'function') {
                setTimeout(() => {
                    window.buildTOCStructure();
                    if (typeof window.highlightActiveSection === 'function') {
                        window.highlightActiveSection();
                    }
                }, 100);
            }
        } else {
            // Hide TOC on Trends and Math tabs
            tocNav.classList.add('hidden');
        }
    }
}

function updateTrendsFilters() {
    // Copy filter tags from metrics to trends
    const metricsContainer = document.getElementById('filterTagsContainer');
    const trendsContainer = document.getElementById('filterTagsContainerTrends');
    
    if (metricsContainer && trendsContainer) {
        trendsContainer.innerHTML = metricsContainer.innerHTML;
    }
    
    // Update filter summary
    const metricsSummary = document.getElementById('filterSummary');
    const trendsSummary = document.getElementById('filterSummaryTrends');
    
    if (metricsSummary && trendsSummary) {
        trendsSummary.innerHTML = metricsSummary.innerHTML;
    }
}

function getTabEmoji(tabName) {
    const emojis = {
        'metrics': '📊',
        'trends': '📈',
        'sprints': '🏃'
    };
    return emojis[tabName] || '';
}

window.switchMainTab = switchMainTab;
window.currentMainTab = currentMainTab; // Export initial value

// ==================================================================
// TRENDS ANALYSIS
// ==================================================================

function renderTrends() {
    // Check if filterData exists
    if (typeof filterData !== 'function') {
        console.error('filterData is not available. Make sure dashboard.js is loaded first.');
        return;
    }
    
    const filteredData = filterData();
    console.log('Rendering trends with', filteredData.length, 'filtered tasks');
    
    // Always calculate overall trend data for summary cards
    const overallTrendData = calculateTrendData(filteredData, 12);
    renderTrendSummary(overallTrendData);
    
    // Determine if we should show grouped trends
    // Count unique values in the filtered data (not all available values)
    const uniqueBoards = new Set();
    const uniqueProjects = new Set();
    for (let i = 0; i < filteredData.length; i++) {
        const board = filteredData[i].board || 'No Board';
        const project = filteredData[i].project_key || 'Unknown';
        if (board && board !== 'Unknown' && board !== 'No Board') {
            uniqueBoards.add(board);
        }
        if (project && project !== 'Unknown') {
            uniqueProjects.add(project);
        }
    }
    
    const uniqueBoardCount = uniqueBoards.size;
    const uniqueProjectCount = uniqueProjects.size;
    
    console.log(`📊 Filtered data contains ${uniqueProjectCount} projects and ${uniqueBoardCount} boards`);
    console.log(`📊 Unique projects:`, Array.from(uniqueProjects).sort());
    console.log(`📊 Unique boards:`, Array.from(uniqueBoards).sort());
    
    // Destroy all existing chart instances before rendering new ones
    Object.keys(trendChartInstances).forEach(key => {
        if (trendChartInstances[key]) {
            console.log(`📊 Destroying chart instance: ${key}`);
            trendChartInstances[key].destroy();
            delete trendChartInstances[key];
        }
    });
    
    // Determine which view to show based on filtered data and active filters
    // If we have multiple unique groups in the filtered data, show grouped trends
    // Otherwise show overall trends
    
    // Check if specific filters are applied (not "all")
    const hasSpecificBoardFilter = typeof selectedBoards !== 'undefined' && selectedBoards.length > 0;
    const hasSpecificProjectFilter = typeof selectedProjects !== 'undefined' && selectedProjects.length > 0;
    
    console.log('📊 Filter status:', {
        hasSpecificBoardFilter,
        hasSpecificProjectFilter,
        selectedBoards: typeof selectedBoards !== 'undefined' ? selectedBoards : 'undefined',
        selectedProjects: typeof selectedProjects !== 'undefined' ? selectedProjects : 'undefined'
    });
    
    // Decide which view to show:
    // 1. If multiple boards in data AND (no specific board filter OR multiple boards selected) -> group by boards
    // 2. Else if multiple projects in data AND (no specific project filter OR multiple projects selected) -> group by projects
    // 3. Otherwise -> show overall trend
    
    const shouldGroupByBoards = uniqueBoardCount > 1 && uniqueBoardCount <= 10 && 
                                (!hasSpecificBoardFilter || (hasSpecificBoardFilter && selectedBoards.length > 1));
    const shouldGroupByProjects = uniqueProjectCount > 1 && uniqueProjectCount <= 15 && 
                                  (!hasSpecificProjectFilter || (hasSpecificProjectFilter && selectedProjects.length > 1));
    
    if (shouldGroupByBoards) {
        // Show trends grouped by board
        console.log('📊 Showing grouped trends by boards:', Array.from(uniqueBoards).sort());
        renderGroupedTrends(filteredData, 'board', 'Направления');
    } else if (shouldGroupByProjects) {
        // Show trends grouped by project
        console.log('📊 Showing grouped trends by projects:', Array.from(uniqueProjects).sort());
        renderGroupedTrends(filteredData, 'project_key', 'Проекты');
    } else {
        // Show overall trends (single project/board or too many groups, or specific filters applied)
        console.log('📊 Showing overall trends');
        renderTrendCharts(overallTrendData);
    }
}
window.renderTrends = renderTrends;

function calculateTrendData(data, monthsCount) {
    console.log('📊 calculateTrendData called with', data.length, 'items for', monthsCount, 'months');
    
    // Get last N months
    const now = new Date();
    const months = [];
    
    for (let i = monthsCount - 1; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        months.push({
            key,
            label: formatMonthName(key),
            date
        });
    }
    
    console.log('📊 Months to analyze:', months.map(m => m.label).join(', '));
    
    // Calculate metrics for each month - optimized with for loops
    const monthlyMetrics = [];
    
    for (let m = 0; m < months.length; m++) {
        const month = months[m];
        
        // Filter data for this month using for loop
        const monthData = [];
        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            if (!item.resolutiondate) continue;
            
            const resDate = new Date(item.resolutiondate);
            const itemKey = `${resDate.getFullYear()}-${String(resDate.getMonth() + 1).padStart(2, '0')}`;
            if (itemKey === month.key) {
                monthData.push(item);
            }
        }
        
        if (monthData.length === 0) {
            monthlyMetrics.push({
                month: month.label,
                key: month.key,
                performance: 0,
                cycleDays: 0,
                debugPercent: 0,
                commPercent: 0,
                crCount: 0,
                taskCount: 0
            });
            continue;
        }
        
        // Calculate performance
        let totalEst = 0;
        let totalSpent = 0;
        let cycleTimes = [];
        let crCount = 0;
        let totalBugSpentClosed = 0;
        let totalTimeSpentOnAllowedBoards = 0;
        let totalServiceSpent = 0;
        let grandTotalSpent = 0;
        
        for (let i = 0; i < monthData.length; i++) {
            const item = monthData[i];
            const spent = parseInt(item.timespent || 0, 10);
            const est = parseInt(item.timeoriginalestimate || 0, 10);
            const type = (item.issuetype || '').toLowerCase();
            
            // Check if board is allowed for debug calculation
            const board = (item.board || '').toLowerCase();
            const allowedBoards = ['flutter', 'ios', 'android', 'frontend', 'backend'];
            const isAllowedBoard = allowedBoards.includes(board);
            
            if (spent > 0 && !type.includes('service')) {
                totalSpent += spent;
                totalEst += est;
            }
            
            // Cycle time
            if (type === 'task') {
                if (item.task_cycle_seconds && item.task_cycle_seconds > 0) {
                    cycleTimes.push(item.task_cycle_seconds);
                } else if (item.resolutiondate && item.created) {
                    const start = new Date(item.created);
                    const end = new Date(item.resolutiondate);
                    const seconds = (end - start) / 1000;
                    if (seconds > 0) cycleTimes.push(seconds);
                }
            }
            
            // Debug: Only count closed bugs/incidents on allowed boards
            if ((type === 'bug' || type === 'incident') && isAllowedBoard && item.resolutiondate) {
                totalBugSpentClosed += spent;
            }
            
            // Total time on allowed boards for debug calculation
            if (isAllowedBoard) {
                totalTimeSpentOnAllowedBoards += spent;
            }
            
            // Comm
            if (type.includes('service')) {
                totalServiceSpent += spent;
            }
            
            grandTotalSpent += spent;
            
            if (isCR(item)) crCount++;
        }
        
        const performance = totalSpent > 0 ? (totalEst / totalSpent) * 100 : 0;
        
        // Calculate average cycle time manually
        let avgCycleSeconds = 0;
        if (cycleTimes.length > 0) {
            let sum = 0;
            for (let i = 0; i < cycleTimes.length; i++) {
                sum += cycleTimes[i];
            }
            avgCycleSeconds = sum / cycleTimes.length;
        }
        const cycleDays = avgCycleSeconds / (3600 * 24);
        
        // Calculate debug and comm percentages
        const debugPercent = totalTimeSpentOnAllowedBoards > 0 ? (totalBugSpentClosed / totalTimeSpentOnAllowedBoards) * 100 : 0;
        const commPercent = grandTotalSpent > 0 ? (totalServiceSpent / grandTotalSpent) * 100 : 0;
        
        monthlyMetrics.push({
            month: month.label,
            key: month.key,
            performance: performance.toFixed(1),
            cycleDays: cycleDays.toFixed(1),
            debugPercent: debugPercent.toFixed(1),
            commPercent: commPercent.toFixed(1),
            crCount,
            taskCount: monthData.length
        });
    }
    
    console.log('📊 Monthly metrics calculated:', monthlyMetrics.length, 'months');
    console.log('📊 Sample data:', monthlyMetrics.slice(-3)); // Show last 3 months
    
    return monthlyMetrics;
}

// Calculate metrics for a specific date period
function calculatePeriodMetrics(data, fromDate, toDate) {
    console.log(`📊 calculatePeriodMetrics for period ${fromDate?.toLocaleDateString('ru-RU')} - ${toDate?.toLocaleDateString('ru-RU')}`);
    
    if (!fromDate || !toDate || !data || data.length === 0) {
        return {
            performance: '0',
            cycleDays: '0',
            debugPercent: '0',
            commPercent: '0',
            crCount: 0,
            taskCount: 0
        };
    }
    
    // Filter data for this period
    const periodData = [];
    const toDateEnd = new Date(toDate.getTime() + 86400000); // Add 1 day to include end date
    
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (!item.resolutiondate) continue;
        
        const resDate = new Date(item.resolutiondate);
        if (resDate >= fromDate && resDate < toDateEnd) {
            periodData.push(item);
        }
    }
    
    console.log(`📊 Found ${periodData.length} tasks in period`);
    
    if (periodData.length === 0) {
        return {
            performance: '0',
            cycleDays: '0',
            debugPercent: '0',
            commPercent: '0',
            crCount: 0,
            taskCount: 0
        };
    }
    
    // Calculate metrics
    let totalEst = 0, totalSpent = 0, cycleTimes = [], crCount = 0;
    let totalBugSpentClosed = 0, totalTimeSpentOnAllowedBoards = 0;
    let totalServiceSpent = 0, grandTotalSpent = 0;
    
    for (let i = 0; i < periodData.length; i++) {
        const item = periodData[i];
        const spent = parseInt(item.timespent || 0, 10);
        const est = parseInt(item.timeoriginalestimate || 0, 10);
        const type = (item.issuetype || '').toLowerCase();
        
        // Check if board is allowed for debug calculation
        const board = (item.board || '').toLowerCase();
        const allowedBoards = ['flutter', 'ios', 'android', 'frontend', 'backend'];
        const isAllowedBoard = allowedBoards.includes(board);
        
        // Performance (exclude service tasks)
        if (spent > 0 && !type.includes('service')) {
            totalSpent += spent;
            totalEst += est;
        }
        
        // Cycle time
        if (type === 'task') {
            if (item.task_cycle_seconds && item.task_cycle_seconds > 0) {
                cycleTimes.push(item.task_cycle_seconds);
            } else if (item.resolutiondate && item.created) {
                const start = new Date(item.created);
                const end = new Date(item.resolutiondate);
                const seconds = (end - start) / 1000;
                if (seconds > 0) cycleTimes.push(seconds);
            }
        }
        
        // Debug: Only count closed bugs/incidents on allowed boards
        if ((type === 'bug' || type === 'incident') && isAllowedBoard) {
            totalBugSpentClosed += spent;
        }
        
        // Total time on allowed boards for debug calculation
        if (isAllowedBoard) {
            totalTimeSpentOnAllowedBoards += spent;
        }
        
        // Comm
        if (type.includes('service')) {
            totalServiceSpent += spent;
        }
        
        grandTotalSpent += spent;
        
        if (isCR(item)) crCount++;
    }
    
    const performance = totalSpent > 0 ? (totalEst / totalSpent) * 100 : 0;
    
    // Calculate average cycle time
    let avgCycleSeconds = 0;
    if (cycleTimes.length > 0) {
        let sum = 0;
        for (let i = 0; i < cycleTimes.length; i++) {
            sum += cycleTimes[i];
        }
        avgCycleSeconds = sum / cycleTimes.length;
    }
    const cycleDays = avgCycleSeconds / (3600 * 24);
    
    // Calculate debug and comm percentages
    const debugPercent = totalTimeSpentOnAllowedBoards > 0 ? (totalBugSpentClosed / totalTimeSpentOnAllowedBoards) * 100 : 0;
    const commPercent = grandTotalSpent > 0 ? (totalServiceSpent / grandTotalSpent) * 100 : 0;
    
    return {
        performance: performance.toFixed(1),
        cycleDays: cycleDays.toFixed(1),
        debugPercent: debugPercent.toFixed(1),
        commPercent: commPercent.toFixed(1),
        crCount,
        taskCount: periodData.length
    };
}

function renderTrendSummary(trendData) {
    console.log('📊 renderTrendSummary called with', trendData.length, 'data points');
    
    // Check if we have date comparison enabled
    const hasComparison = typeof dateFilter !== 'undefined' && 
                          dateFilter.compareEnabled && 
                          dateFilter.compareFrom && 
                          dateFilter.compareTo;
    
    console.log('📊 Date comparison enabled:', hasComparison);
    
    // Update comparison info text
    const comparisonInfoEl = document.getElementById('trendComparisonInfo');
    if (comparisonInfoEl) {
        if (hasComparison) {
            // Custom period comparison
            const currentStart = dateFilter.from?.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
            const currentEnd = dateFilter.to?.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
            const compareStart = dateFilter.compareFrom?.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
            const compareEnd = dateFilter.compareTo?.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
            
            comparisonInfoEl.textContent = `Сравнение: ${currentStart} - ${currentEnd}  vs  ${compareStart} - ${compareEnd}`;
        } else if (trendData && trendData.length >= 2) {
            // Last month comparison
            const current = trendData[trendData.length - 1];
            const previous = trendData[trendData.length - 2];
            
            comparisonInfoEl.textContent = `Сравнение: текущий месяц (${current.month || 'последний'}) vs предыдущий месяц (${previous.month || 'предпоследний'})`;
        } else {
            comparisonInfoEl.textContent = 'Недостаточно данных для сравнения периодов';
        }
    }
    
    if (!trendData || trendData.length < 1) {
        console.warn('⚠️ Not enough trend data to display');
        // Set all to "no data"
        ['trendPerf', 'trendCycle', 'trendDebug', 'trendComm', 'trendCR'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '-';
        });
        ['trendPerfChange', 'trendCycleChange', 'trendDebugChange', 'trendCommChange', 'trendCRChange'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = 'Нет данных';
                el.classList.remove('positive', 'negative', 'neutral');
            }
        });
        return;
    }
    
    // Get current period metrics
    let current, previous;
    
    if (hasComparison) {
        // Use comparison periods
        console.log('📊 Using comparison periods:', {
            current: `${dateFilter.from?.toLocaleDateString('ru-RU')} - ${dateFilter.to?.toLocaleDateString('ru-RU')}`,
            compare: `${dateFilter.compareFrom?.toLocaleDateString('ru-RU')} - ${dateFilter.compareTo?.toLocaleDateString('ru-RU')}`
        });
        
        const filteredData = filterData();
        current = calculatePeriodMetrics(filteredData, dateFilter.from, dateFilter.to);
        previous = calculatePeriodMetrics(filteredData, dateFilter.compareFrom, dateFilter.compareTo);
        
        console.log('📊 Current period metrics:', current);
        console.log('📊 Previous period metrics:', previous);
    } else {
        // Use last month comparison (existing logic)
        current = trendData[trendData.length - 1];
        const hasPrevious = trendData.length >= 2;
        previous = hasPrevious ? trendData[trendData.length - 2] : current;
        
        console.log('📊 Current:', current);
        console.log('📊 Previous:', previous);
    }
    
    // Always show current values
    const perfEl = document.getElementById('trendPerf');
    const cycleEl = document.getElementById('trendCycle');
    const debugEl = document.getElementById('trendDebug');
    const commEl = document.getElementById('trendComm');
    const crEl = document.getElementById('trendCR');
    
    console.log('📊 DOM elements found:', {
        perfEl: !!perfEl,
        cycleEl: !!cycleEl,
        debugEl: !!debugEl,
        commEl: !!commEl,
        crEl: !!crEl
    });
    
    if (perfEl) {
        perfEl.textContent = current.performance + '%';
        console.log('📊 Set trendPerf to:', current.performance + '%');
    }
    if (cycleEl) {
        cycleEl.textContent = current.cycleDays + ' дн.';
        console.log('📊 Set trendCycle to:', current.cycleDays + ' дн.');
    }
    if (debugEl) {
        debugEl.textContent = current.debugPercent + '%';
        console.log('📊 Set trendDebug to:', current.debugPercent + '%');
    }
    if (commEl) {
        commEl.textContent = current.commPercent + '%';
        console.log('📊 Set trendComm to:', current.commPercent + '%');
    }
    if (crEl) {
        crEl.textContent = current.crCount;
        console.log('📊 Set trendCR to:', current.crCount);
    }
    
    // If we have previous data, calculate and show changes
    const hasPrevious = previous && (hasComparison || trendData.length >= 2);
    
    if (hasPrevious) {
        // Performance trend (with zero division protection)
        const prevPerf = parseFloat(previous.performance);
        const currPerf = parseFloat(current.performance);
        const perfChange = prevPerf > 0 ? ((currPerf - prevPerf) / prevPerf) * 100 : 0;
        updateTrendIndicator('trendPerfChange', perfChange, '%', false, false, hasComparison);
        
        // Cycle time trend (lower is better - growth is bad)
        const prevCycle = parseFloat(previous.cycleDays);
        const currCycle = parseFloat(current.cycleDays);
        const cycleChange = prevCycle > 0 ? ((currCycle - prevCycle) / prevCycle) * 100 : 0;
        updateTrendIndicator('trendCycleChange', cycleChange, '%', false, true, hasComparison); // invertLogic = true (growth is bad)
        
        // Debug trend (lower is better - growth is bad)
        const prevDebug = parseFloat(previous.debugPercent);
        const currDebug = parseFloat(current.debugPercent);
        const debugChange = prevDebug > 0 ? ((currDebug - prevDebug) / prevDebug) * 100 : 0;
        updateTrendIndicator('trendDebugChange', debugChange, '%', false, true, hasComparison); // invertLogic = true (growth is bad)
        
        // Comm trend (lower is better - growth is bad)
        const prevComm = parseFloat(previous.commPercent);
        const currComm = parseFloat(current.commPercent);
        const commChange = prevComm > 0 ? ((currComm - prevComm) / prevComm) * 100 : 0;
        updateTrendIndicator('trendCommChange', commChange, '%', false, true, hasComparison); // invertLogic = true (growth is bad)
        
        // CR trend (lower is better, so invert logic)
        const crChange = current.crCount - previous.crCount;
        updateTrendIndicator('trendCRChange', crChange, ' задач', true, true, hasComparison); // invertLogic = true
        
        console.log('📊 Changes calculated:', { perfChange, cycleChange, debugChange, commChange, crChange });
    } else {
        // No previous data - show "no comparison"
        ['trendPerfChange', 'trendCycleChange', 'trendDebugChange', 'trendCommChange', 'trendCRChange'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = 'Недостаточно данных для сравнения';
                el.classList.remove('positive', 'negative');
                el.classList.add('neutral');
            }
        });
        console.log('📊 Not enough data for comparison');
    }
}

function updateTrendIndicator(elementId, change, suffix, isAbsolute = false, invertLogic = false, isCustomPeriod = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    el.classList.remove('positive', 'negative', 'neutral');
    
    const comparisonText = isCustomPeriod ? ' vs период сравнения' : ' vs прошлый месяц';
    
    if (isAbsolute) {
        el.textContent = (change > 0 ? '+' : '') + change.toFixed(0) + suffix + comparisonText;
    } else {
        el.textContent = (change > 0 ? '+' : '') + change.toFixed(1) + suffix + comparisonText;
    }
    
    // Apply color logic (inverted if invertLogic is true)
    const effectiveChange = invertLogic ? -change : change;
    
    if (effectiveChange > 2) {
        el.classList.add('positive');
    } else if (effectiveChange < -2) {
        el.classList.add('negative');
    } else {
        el.classList.add('neutral');
    }
}

function renderTrendCharts(trendData) {
    const labels = trendData.map(d => d.month);
    
    // Performance trend with moving average
    const perfData = trendData.map(d => parseFloat(d.performance));
    const perfMA = calculateMovingAverage(perfData, 3);
    
    updateTrendChart('trendPerfChart', 'line', {
        labels,
        datasets: [
            {
                label: 'Производительность',
                data: perfData,
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                tension: 0.3,
                fill: true
            },
            {
                label: 'Скользящее среднее (3 мес)',
                data: perfMA,
                borderColor: '#e74c3c',
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                tension: 0.3
            }
        ]
    }, {
        scales: {
            y: {
                beginAtZero: false,
                title: { display: true, text: '%' }
            }
        }
    });
    
    // Cycle time trend
    const cycleData = trendData.map(d => parseFloat(d.cycleDays));
    const cycleMA = calculateMovingAverage(cycleData, 3);
    
    updateTrendChart('trendCycleChart', 'line', {
        labels,
        datasets: [
            {
                label: 'Ср. время выполнения',
                data: cycleData,
                borderColor: '#e74c3c',
                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                tension: 0.3,
                fill: true
            },
            {
                label: 'Скользящее среднее (3 мес)',
                data: cycleMA,
                borderColor: '#3498db',
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                tension: 0.3
            }
        ]
    }, {
        scales: {
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Дни' }
            }
        }
    });
    
    // CR trend
    const crData = trendData.map(d => d.crCount);
    
    updateTrendChart('trendCRChart', 'bar', {
        labels,
        datasets: [{
            label: 'Change Requests',
            data: crData,
            backgroundColor: '#2ecc71',
            borderColor: '#27ae60',
            borderWidth: 1
        }]
    }, {
        scales: {
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Количество' }
            }
        }
    });
}

function calculateMovingAverage(data, windowSize) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
        if (i < windowSize - 1) {
            result.push(null);
        } else {
            const window = data.slice(i - windowSize + 1, i + 1);
            const avg = window.reduce((a, b) => a + b, 0) / windowSize;
            result.push(avg);
        }
    }
    return result;
}

function updateTrendChart(canvasId, type, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (trendChartInstances[canvasId]) {
        trendChartInstances[canvasId].destroy();
    }
    
    trendChartInstances[canvasId] = new Chart(ctx, {
        type,
        data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            },
            ...options
        }
    });
}

// ==================================================================
// GROUPED TRENDS (by Project or Board)
// ==================================================================

function renderGroupedTrends(data, groupField, groupName) {
    const trendsSection = document.getElementById('trendsSection');
    if (!trendsSection) return;
    
    // Get unique groups - optimized
    const groupSet = new Set();
    for (let i = 0; i < data.length; i++) {
        const value = data[i][groupField] || 'Unknown';
        if (value && value !== 'Unknown' && value !== 'No Board') {
            groupSet.add(value);
        }
    }
    const groups = Array.from(groupSet).sort();
    
    console.log(`Rendering grouped trends by ${groupField}:`, groups);
    
    // IMPORTANT: Find the charts container, not the whole section
    let chartsContainer = document.getElementById('trendsChartsContainer');
    if (!chartsContainer) {
        // If container doesn't exist, create it after summary cards
        const summaryCards = trendsSection.querySelector('.summary-cards');
        chartsContainer = document.createElement('div');
        chartsContainer.id = 'trendsChartsContainer';
        if (summaryCards && summaryCards.nextSibling) {
            trendsSection.insertBefore(chartsContainer, summaryCards.nextSibling);
        } else {
            trendsSection.appendChild(chartsContainer);
        }
    }
    
    // Calculate last 6 months
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        months.push({
            key,
            label: formatMonthName(key)
        });
    }
    
    // Calculate metrics for each group per month - heavily optimized
    const groupMetrics = [];
    
    for (let g = 0; g < groups.length; g++) {
        const group = groups[g];
        
        // Filter group data using for loop
        const groupData = [];
        for (let i = 0; i < data.length; i++) {
            if ((data[i][groupField] || 'Unknown') === group) {
                groupData.push(data[i]);
            }
        }
        
        const monthlyData = [];
        for (let m = 0; m < months.length; m++) {
            const month = months[m];
            
            // Filter month data using for loop
            const monthData = [];
            for (let i = 0; i < groupData.length; i++) {
                const item = groupData[i];
                if (!item.resolutiondate) continue;
                
                const resDate = new Date(item.resolutiondate);
                const itemKey = `${resDate.getFullYear()}-${String(resDate.getMonth() + 1).padStart(2, '0')}`;
                if (itemKey === month.key) {
                    monthData.push(item);
                }
            }
            
            if (monthData.length === 0) {
                monthlyData.push({ performance: 0, cycleDays: 0, crCount: 0 });
                continue;
            }
            
            let totalEst = 0, totalSpent = 0, cycleTimes = [], crCount = 0;
            
            for (let i = 0; i < monthData.length; i++) {
                const item = monthData[i];
                const spent = parseInt(item.timespent || 0, 10);
                const est = parseInt(item.timeoriginalestimate || 0, 10);
                if (spent > 0) {
                    totalSpent += spent;
                    totalEst += est;
                }
                
                const type = (item.issuetype || '').toLowerCase();
                if (type === 'task') {
                    if (item.task_cycle_seconds && item.task_cycle_seconds > 0) {
                        cycleTimes.push(item.task_cycle_seconds);
                    } else if (item.resolutiondate && item.created) {
                        const start = new Date(item.created);
                        const end = new Date(item.resolutiondate);
                        const seconds = (end - start) / 1000;
                        if (seconds > 0) cycleTimes.push(seconds);
                    }
                }
                
                if (isCR(item)) crCount++;
            }
            
            const performance = totalSpent > 0 ? (totalEst / totalSpent) * 100 : 0;
            
            // Calculate average manually
            let avgCycleSeconds = 0;
            if (cycleTimes.length > 0) {
                let sum = 0;
                for (let i = 0; i < cycleTimes.length; i++) {
                    sum += cycleTimes[i];
                }
                avgCycleSeconds = sum / cycleTimes.length;
            }
            const cycleDays = avgCycleSeconds / (3600 * 24);
            
            monthlyData.push({ performance, cycleDays, crCount });
        }
        
        groupMetrics.push({ group, monthlyData });
    }
    
    // Render HTML
    const colors = [
        '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', 
        '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b'
    ];
    
    // Update only the charts container, not the whole section (preserve summary cards)
    chartsContainer.innerHTML = `
        <div style="margin-bottom: 30px;">
            <h2 style="color: #2c3e50; margin-bottom: 10px;">Трендовый анализ по ${groupName}</h2>
            <p style="color: #7f8c8d; font-size: 14px;">Динамика ключевых метрик за последние 6 месяцев</p>
        </div>
        
        <div class="trend-charts-container">
            <div class="trend-chart-item">
                <h3>Производительность по ${groupName}</h3>
                <canvas id="groupedPerfChart"></canvas>
            </div>
            
            <div class="trend-chart-item">
                <h3>Среднее время выполнения по ${groupName}</h3>
                <canvas id="groupedCycleChart"></canvas>
            </div>
            
            <div class="trend-chart-item">
                <h3>Change Requests по ${groupName}</h3>
                <canvas id="groupedCRChart"></canvas>
            </div>
        </div>
    `;
    
    console.log('📊 Grouped trends HTML updated in chartsContainer');
    
    const labels = months.map(m => m.label);
    
    // Performance chart
    const perfDatasets = groupMetrics.map((gm, idx) => ({
        label: gm.group,
        data: gm.monthlyData.map(md => parseFloat(md.performance.toFixed(1))),
        borderColor: colors[idx % colors.length],
        backgroundColor: colors[idx % colors.length] + '20',
        tension: 0.3
    }));
    
    updateTrendChart('groupedPerfChart', 'line', {
        labels,
        datasets: perfDatasets
    }, {
        scales: {
            y: {
                beginAtZero: false,
                title: { display: true, text: 'Производительность (%)' }
            }
        }
    });
    
    // Cycle time chart
    const cycleDatasets = groupMetrics.map((gm, idx) => ({
        label: gm.group,
        data: gm.monthlyData.map(md => parseFloat(md.cycleDays.toFixed(1))),
        borderColor: colors[idx % colors.length],
        backgroundColor: colors[idx % colors.length] + '20',
        tension: 0.3
    }));
    
    updateTrendChart('groupedCycleChart', 'line', {
        labels,
        datasets: cycleDatasets
    }, {
        scales: {
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Дни' }
            }
        }
    });
    
    // CR chart
    const crDatasets = groupMetrics.map((gm, idx) => ({
        label: gm.group,
        data: gm.monthlyData.map(md => md.crCount),
        backgroundColor: colors[idx % colors.length],
        borderColor: colors[idx % colors.length],
        borderWidth: 1
    }));
    
    updateTrendChart('groupedCRChart', 'bar', {
        labels,
        datasets: crDatasets
    }, {
        scales: {
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Количество CR' }
            }
        }
    });
}

// ==================================================================
// SPRINT ANALYSIS
// ==================================================================

function populateSprintSelector() {
    const sprints = getUniqueSprintValues();
    const selector = document.getElementById('sprintSelect');
    if (!selector) return;
    
    selector.innerHTML = '<option value="">-- Выберите спринт --</option>';
    sprints.forEach(sprint => {
        if (sprint !== 'Без спринта') {
            const option = document.createElement('option');
            option.value = sprint;
            option.textContent = sprint;
            selector.appendChild(option);
        }
    });
}

function loadSprintAnalysis() {
    const selector = document.getElementById('sprintSelect');
    const sprintName = selector.value;
    
    if (!sprintName) {
        // Hide all sprint sections
        document.getElementById('sprintSummary').style.display = 'none';
        document.getElementById('sprintCharts').style.display = 'none';
        document.getElementById('capacityPlanning').style.display = 'none';
        return;
    }
    
    const filteredData = filterData();
    const sprintData = filteredData.filter(item => {
        const sprints = Array.isArray(item.sprint) ? item.sprint : [];
        return sprints.includes(sprintName);
    });
    
    // Show sections
    document.getElementById('sprintSummary').style.display = 'flex';
    document.getElementById('sprintCharts').style.display = 'grid';
    document.getElementById('capacityPlanning').style.display = 'block';
    
    // Render sprint analysis
    renderSprintSummary(sprintData);
    renderBurndownChart(sprintData, sprintName);
    renderVelocityChart(filteredData, sprintName);
    renderCapacityPlanning(filteredData);
}
window.loadSprintAnalysis = loadSprintAnalysis;

function renderSprintSummary(sprintData) {
    const total = sprintData.length;
    const completed = sprintData.filter(item => item.resolutiondate).length;
    const velocity = completed; // Simple velocity = completed tasks
    
    // Calculate performance
    let totalEst = 0;
    let totalSpent = 0;
    sprintData.forEach(item => {
        const spent = parseInt(item.timespent || 0, 10);
        const est = parseInt(item.timeoriginalestimate || 0, 10);
        if (spent > 0) {
            totalSpent += spent;
            totalEst += est;
        }
    });
    const performance = totalSpent > 0 ? ((totalEst / totalSpent) * 100).toFixed(1) : '0.0';
    
    document.getElementById('sprintTotalTasks').textContent = total;
    document.getElementById('sprintCompletedTasks').textContent = completed;
    document.getElementById('sprintVelocity').textContent = velocity;
    document.getElementById('sprintPerf').textContent = performance + '%';
}

function renderBurndownChart(sprintData, sprintName) {
    // Simplified burndown: tasks remaining over time
    // Group by resolution date
    const tasksByDate = {};
    const totalTasks = sprintData.length;
    
    sprintData.forEach(item => {
        if (item.resolutiondate) {
            const date = item.resolutiondate.split('T')[0];
            if (!tasksByDate[date]) tasksByDate[date] = 0;
            tasksByDate[date]++;
        }
    });
    
    // Sort dates
    const dates = Object.keys(tasksByDate).sort();
    
    // Calculate remaining tasks
    let remaining = totalTasks;
    const burndownData = [{ date: 'Start', remaining: totalTasks }];
    
    dates.forEach(date => {
        remaining -= tasksByDate[date];
        burndownData.push({
            date: date.substring(5), // MM-DD
            remaining
        });
    });
    
    // Ideal line
    const idealData = burndownData.map((_, idx) => {
        return totalTasks - (totalTasks * idx / (burndownData.length - 1));
    });
    
    updateSprintChart('burndownChart', 'line', {
        labels: burndownData.map(d => d.date),
        datasets: [
            {
                label: 'Фактический burndown',
                data: burndownData.map(d => d.remaining),
                borderColor: '#e74c3c',
                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                tension: 0.1,
                fill: true
            },
            {
                label: 'Идеальный burndown',
                data: idealData,
                borderColor: '#95a5a6',
                borderDash: [5, 5],
                borderWidth: 2,
                pointRadius: 0,
                fill: false
            }
        ]
    }, {
        scales: {
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Задачи' }
            }
        }
    });
}

function renderVelocityChart(allData, currentSprint) {
    // Get all sprints and their velocities
    const allSprints = getUniqueSprintValues().filter(s => s !== 'Без спринта');
    
    // Calculate velocity for each sprint (completed tasks)
    const velocities = allSprints.map(sprint => {
        const sprintTasks = allData.filter(item => {
            const sprints = Array.isArray(item.sprint) ? item.sprint : [];
            return sprints.includes(sprint) && item.resolutiondate;
        });
        return {
            sprint,
            velocity: sprintTasks.length
        };
    }).filter(v => v.velocity > 0).slice(-10); // Last 10 sprints
    
    updateSprintChart('velocityChart', 'bar', {
        labels: velocities.map(v => v.sprint),
        datasets: [{
            label: 'Velocity (завершенные задачи)',
            data: velocities.map(v => v.velocity),
            backgroundColor: velocities.map(v => 
                v.sprint === currentSprint ? '#3498db' : '#95a5a6'
            ),
            borderColor: '#2c3e50',
            borderWidth: 1
        }]
    }, {
        scales: {
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Задачи' }
            }
        }
    });
}

function renderCapacityPlanning(allData) {
    // Calculate average velocity from last 5 sprints
    const allSprints = getUniqueSprintValues().filter(s => s !== 'Без спринта');
    const recentSprints = allSprints.slice(-5);
    
    let totalVelocity = 0;
    let sprintCount = 0;
    
    recentSprints.forEach(sprint => {
        const completed = allData.filter(item => {
            const sprints = Array.isArray(item.sprint) ? item.sprint : [];
            return sprints.includes(sprint) && item.resolutiondate;
        }).length;
        
        if (completed > 0) {
            totalVelocity += completed;
            sprintCount++;
        }
    });
    
    const avgVelocity = sprintCount > 0 ? (totalVelocity / sprintCount).toFixed(1) : 0;
    const recommended = Math.round(avgVelocity);
    const rangeMin = Math.round(avgVelocity * 0.8);
    const rangeMax = Math.round(avgVelocity * 1.2);
    
    document.getElementById('avgVelocity').textContent = avgVelocity + ' задач/спринт';
    document.getElementById('recommendedCapacity').textContent = recommended + ' задач';
    document.getElementById('capacityRange').textContent = `${rangeMin} - ${rangeMax} задач`;
}

function updateSprintChart(canvasId, type, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (sprintChartInstances[canvasId]) {
        sprintChartInstances[canvasId].destroy();
    }
    
    sprintChartInstances[canvasId] = new Chart(ctx, {
        type,
        data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            },
            ...options
        }
    });
}

// Initialize
console.log('Analytics module loaded');

