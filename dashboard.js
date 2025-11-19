// Constants
const DATA_URL = './issues_flat.json';

// State
let rawData = [];
let chartInstances = {};
let currentGrouping = 'project'; // 'project', 'assignee', 'board', 'month', 'sprint', 'epic'

// Table search
let metricsSearchQuery = '';

// Multi-select Filter State
let selectedBoards = [];
let selectedProjects = [];
let selectedAssignees = [];
let selectedSprints = [];
let selectedEpics = [];

// Sort State
let currentSort = {
    field: 'rawTotal', // Default sort by activity
    direction: 'desc'
};

// DOM Elements
const viewModeRadios = document.getElementsByName('viewMode');
const tableBody = document.getElementById('metricsTableBody');
const resetBtn = document.getElementById('resetFilters');
const tableTitle = document.getElementById('tableTitle');
const colName = document.getElementById('col-name');
const openFiltersBtn = document.getElementById('openFiltersBtn');
const filtersModal = document.getElementById('filtersModalShared');
// filterSummary removed - using tag cloud only

// Details Modal Elements
const detailsModal = document.getElementById('detailsModal');
const detailsTitle = document.getElementById('detailsTitle');
const tasksTableBody = document.getElementById('tasksTableBody');
const drillDownControls = document.getElementById('drillDownControls');

// Toggle additional view modes
function toggleAdditionalModes() {
    const additionalModes = document.getElementById('additionalModes');
    const btnText = document.getElementById('moreModesBtnText');
    
    if (additionalModes.style.display === 'none') {
        additionalModes.style.display = 'flex';
        btnText.textContent = 'Скрыть ▲';
    } else {
        additionalModes.style.display = 'none';
        btnText.textContent = 'Еще ▼';
    }
}
window.toggleAdditionalModes = toggleAdditionalModes;

// Show welcome screen when no data file is available
function showWelcomeScreen() {
    console.log('📊 No data file found, showing welcome screen');
    
    document.querySelector('.container').innerHTML = `
        <div style="max-width: 800px; margin: 60px auto; padding: 40px; text-align: center;">
            <div style="font-size: 64px; margin-bottom: 20px;">📊</div>
            <h1 style="color: #2c7be5; margin-bottom: 20px;">Добро пожаловать в DXCore4 Analytics</h1>
            <p style="font-size: 18px; color: #666; margin-bottom: 40px; line-height: 1.6;">
                Для начала работы загрузите файл с данными из Jira
            </p>
            
            <div style="background: #f8f9fa; padding: 30px; border-radius: 12px; margin-bottom: 30px; text-align: left;">
                <h3 style="margin-top: 0; color: #2c3e50; margin-bottom: 20px;">
                    📋 Как получить данные из Jira:
                </h3>
                <ol style="line-height: 2; font-size: 16px; color: #555;">
                    <li>Запустите скрипт экспорта: <code style="background: #fff; padding: 4px 8px; border-radius: 4px; color: #e74c3c;">./jira_metrics.sh</code></li>
                    <li>Дождитесь создания файла <code style="background: #fff; padding: 4px 8px; border-radius: 4px;">issues_flat.json</code></li>
                    <li>Нажмите кнопку ниже, чтобы загрузить файл</li>
                </ol>
            </div>
            
            <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                <button onclick="document.getElementById('fileInput').click()" style="
                    padding: 16px 32px;
                    background: #2c7be5;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(44, 123, 229, 0.3);
                    transition: all 0.3s;
                ">
                    📤 Загрузить файл с данными
                </button>
                
                <button onclick="location.reload()" style="
                    padding: 16px 32px;
                    background: #95a5a6;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                ">
                    🔄 Обновить страницу
                </button>
            </div>
            
            <div style="margin-top: 40px; padding: 20px; background: #e8f4f8; border-radius: 8px; text-align: left;">
                <h4 style="margin-top: 0; color: #2c7be5;">💡 Совет:</h4>
                <p style="color: #555; margin: 0; line-height: 1.6;">
                    Если вы разрабатываете локально, положите файл <code style="background: #fff; padding: 2px 6px; border-radius: 3px;">issues_flat.json</code> 
                    в корневую папку проекта, и он загрузится автоматически при следующем обновлении страницы.
                </p>
            </div>
        </div>
    `;
}

// Initialize
function updateDateRange() {
    const dateRangeText = document.getElementById('dateRangeText');
    
    // If date filter is active, use it directly
    if (dateFilter.enabled && dateFilter.from && dateFilter.to) {
        const formatDate = (date) => {
            const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 
                          'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
            return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()} года`;
        };
        
        dateRangeText.textContent = `Период: с ${formatDate(dateFilter.from)} по ${formatDate(dateFilter.to)}`;
        return;
    }
    
    // Otherwise, analyze filtered data to find date range
    const dataToAnalyze = (typeof filterData === 'function') ? filterData() : rawData;
    
    if (dataToAnalyze.length === 0) {
        if (dateRangeText) dateRangeText.textContent = 'Период не определен';
        return;
    }
    
    // Find min and max dates from created and resolutiondate
    let minDate = null;
    let maxDate = null;
    
    // Use regular for loop to prevent stack overflow on large datasets
    for (let i = 0; i < dataToAnalyze.length; i++) {
        const item = dataToAnalyze[i];
        const dates = [item.created, item.resolutiondate, item.updated];
        
        for (let j = 0; j < dates.length; j++) {
            const dateStr = dates[j];
            if (!dateStr) continue;
            
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) continue;
            
            if (!minDate || date < minDate) minDate = date;
            if (!maxDate || date > maxDate) maxDate = date;
        }
    }
    
    if (minDate && maxDate) {
        const formatDate = (date) => {
            const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 
                          'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
            return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()} года`;
        };
        
        dateRangeText.textContent = `Период: с ${formatDate(minDate)} по ${formatDate(maxDate)}`;
    } else {
        dateRangeText.textContent = 'Период не определен';
    }
}

async function init() {
    try {
        console.log('Attempting to fetch data from:', DATA_URL);
        
        // Show loading with progress
        const loadingDiv = document.querySelector('.loading');
        if (loadingDiv) {
            loadingDiv.innerHTML = '<h2>Загрузка данных...</h2><p>Проверка наличия файла данных...</p>';
        }
        
        const response = await fetch(DATA_URL);
        console.log('Response status:', response.status);
        
        // If file not found, show friendly message instead of error
        if (response.status === 404) {
            showWelcomeScreen();
            return;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        console.log('Parsing JSON... This may take 10-20 seconds for large files.');
        if (loadingDiv) {
            loadingDiv.innerHTML = '<h2>Парсинг данных...</h2><p>Обработка большого JSON файла (это может занять 10-20 сек)</p>';
        }
        
        // Parse JSON with timeout to allow UI update
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const startParse = Date.now();
        const text = await response.text();
        console.log(`Downloaded ${(text.length / 1024 / 1024).toFixed(2)}MB text`);
        
        if (loadingDiv) {
            loadingDiv.innerHTML = '<h2>Парсинг JSON...</h2><p>Преобразование текста в объекты</p>';
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
        try {
            rawData = JSON.parse(text);
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            throw new Error(`Ошибка парсинга JSON: ${parseError.message}`);
        }
        
        const parseDuration = ((Date.now() - startParse) / 1000).toFixed(1);
        console.log(`✅ Loaded ${rawData.length} issues in ${parseDuration}s`);
        
        if (loadingDiv) {
            loadingDiv.innerHTML = '<h2>Инициализация...</h2><p>Подготовка фильтров и интерфейса</p>';
        }
        
        // Use setTimeout to prevent stack overflow
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Populate filters with delay to prevent stack overflow
        await new Promise(resolve => setTimeout(resolve, 100));
        try {
            console.log('Step 1: Populating filters...');
            if (loadingDiv) loadingDiv.innerHTML = '<h2>Шаг 1/3</h2><p>Подготовка фильтров</p>';
            populateFilters();
            console.log('✓ Filters populated');
        } catch (e) {
            console.error('❌ Error in populateFilters:', e);
            throw new Error('populateFilters failed: ' + e.message);
        }
        
        // Apply default date filter: Last 6 months (180 days from current date)
        await new Promise(resolve => setTimeout(resolve, 50));
        console.log('Step 2: Applying default date filter (Last 6 months = 180 days)...');
        if (loadingDiv) loadingDiv.innerHTML = '<h2>Шаг 2/3</h2><p>Применение фильтра по дате</p>';
        const now = new Date();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180); // 180 дней назад от текущей даты
        dateFilter.enabled = true;
        dateFilter.from = sixMonthsAgo;
        dateFilter.to = now;
        updateDateFilterTag();
        console.log(`✓ Date filter applied: from ${sixMonthsAgo.toLocaleDateString('ru-RU')} to ${now.toLocaleDateString('ru-RU')}`);
        
        // Update dashboard with delay
        await new Promise(resolve => setTimeout(resolve, 100));
        try {
            console.log('Step 3: Rendering dashboard...');
            if (loadingDiv) loadingDiv.innerHTML = '<h2>Шаг 3/3</h2><p>Отрисовка дашборда</p>';
            updateDashboard();
            console.log('✓ Dashboard rendered');
        } catch (e) {
            console.error('❌ Error in updateDashboard:', e);
            throw new Error('updateDashboard failed: ' + e.message);
        }

        // Event Listeners
        openFiltersBtn.addEventListener('click', openFiltersModal);
        
        viewModeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                currentGrouping = e.target.value;
                // Clear search when changing view mode
                metricsSearchQuery = '';
                const searchInput = document.getElementById('metricsTableSearch');
                if (searchInput) searchInput.value = '';
                updateDashboard();
            });
        });

        resetBtn.addEventListener('click', resetFilters);
        
        // Close modals on outside click
        window.addEventListener('click', (e) => {
            if (e.target === detailsModal) closeDetails();
            if (e.target === filtersModal) closeFiltersModal();
            const taskModal = document.getElementById('taskDetailModal');
            if (e.target === taskModal) closeTaskDetail();
            const kpiModal = document.getElementById('kpiModal');
            if (e.target === kpiModal) closeKPIModal();
        });

    } catch (error) {
        console.error('❌ Error loading data:', error);
        
        // If it's a network error (file not found), show welcome screen
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            console.log('Network error detected, showing welcome screen');
            showWelcomeScreen();
            return;
        }
        
        // For other errors, show detailed error message
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            dataUrl: DATA_URL,
            currentUrl: window.location.href
        });
        
        document.querySelector('.container').innerHTML = `
            <div class="loading" style="text-align: center; padding: 60px 20px;">
                <h2 style="color: #e74c3c; margin-bottom: 20px;">⚠️ Ошибка обработки данных</h2>
                <p style="font-size: 16px; margin-bottom: 10px;">Произошла ошибка при обработке файла данных</p>
                <p style="color: #666; margin-bottom: 20px;">Ошибка: <code style="color: #e74c3c;">${error.message}</code></p>
                
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px auto; max-width: 600px; text-align: left;">
                    <h3 style="margin-top: 0; color: #2c3e50;">Возможные причины:</h3>
                    <ul style="line-height: 1.8;">
                        <li>Файл поврежден или имеет неправильный формат JSON</li>
                        <li>Недостаточно памяти для обработки большого файла</li>
                        <li>Проблемы с кодировкой файла</li>
                        <li>Откройте консоль браузера (F12) для подробностей</li>
                    </ul>
                </div>
                
                <div style="display: flex; gap: 15px; justify-content: center; margin-top: 20px;">
                    <button onclick="document.getElementById('fileInput').click()" style="
                        padding: 12px 24px;
                        background: #2c7be5;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        font-size: 14px;
                        cursor: pointer;
                    ">📤 Загрузить другой файл</button>
                    
                    <button onclick="location.reload()" style="
                        padding: 12px 24px;
                        background: #95a5a6;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        font-size: 14px;
                        cursor: pointer;
                    ">🔄 Попробовать снова</button>
                </div>
            </div>
        `;
    }
}

function populateFilters() {
    const boards = getUniqueValues('board', 'No Board');
    const projects = getUniqueValues('project_key', 'Unknown');
    const assignees = getUniqueValues('assignee', 'Не назначен');
    const sprints = getUniqueSprintValues();
    const epics = getUniqueValues('epic_link', 'Без эпика');

    // Initially select all
    selectedBoards = [...boards];
    selectedProjects = [...projects];
    selectedAssignees = [...assignees];
    selectedSprints = [...sprints];
    selectedEpics = [...epics];

    // Populate Checkbox Lists
    populateCheckboxList('boardCheckboxList', boards, 'board');
    populateCheckboxList('projectCheckboxList', projects, 'project');
    populateCheckboxList('assigneeCheckboxList', assignees, 'assignee');
    populateCheckboxList('sprintCheckboxList', sprints, 'sprint');
    populateCheckboxList('epicCheckboxList', epics, 'epic');
    
    updateFilterSummary();
}

function populateCheckboxList(containerId, items, type) {
    const container = document.getElementById(containerId);
    
    // Use regular for loop and string concatenation for better performance
    let html = '';
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const escapedItem = escapeHtml(item);
        const escapedId = escapeId(item);
        const lowerValue = escapedItem.toLowerCase();
        
        html += `<div class="checkbox-item filter-item" data-filter-type="${type}" data-filter-value="${lowerValue}" onclick="toggleCheckboxItem(event, '${type}-${escapedId}')">
            <input type="checkbox" id="${type}-${escapedId}" value="${escapedItem}" checked onchange="updateFilterSelection('${type}', '${escapedItem}', this.checked)">
            <label for="${type}-${escapedId}">${item}</label>
        </div>`;
    }
    container.innerHTML = html;
}

// Toggle checkbox when clicking anywhere on the checkbox-item
function toggleCheckboxItem(event, checkboxId) {
    // Prevent double-toggle if clicked directly on checkbox or label
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'LABEL') {
        return;
    }
    
    const checkbox = document.getElementById(checkboxId);
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
    }
}

// Filter search function
function filterSearchResults() {
    const searchTerm = document.getElementById('filterSearchInput').value.toLowerCase();
    const allFilterItems = document.querySelectorAll('.filter-item');
    
    allFilterItems.forEach(item => {
        const filterValue = item.getAttribute('data-filter-value');
        if (filterValue.includes(searchTerm)) {
            item.classList.remove('hidden');
        } else {
            item.classList.add('hidden');
        }
    });
}
window.filterSearchResults = filterSearchResults;

function escapeId(str) {
    return str.replace(/[^a-zA-Z0-9]/g, '_');
}

function updateFilterSelection(type, value, checked) {
    if (type === 'board') {
        if (checked && !selectedBoards.includes(value)) {
            selectedBoards.push(value);
        } else if (!checked) {
            selectedBoards = selectedBoards.filter(b => b !== value);
        }
    } else if (type === 'project') {
        if (checked && !selectedProjects.includes(value)) {
            selectedProjects.push(value);
        } else if (!checked) {
            selectedProjects = selectedProjects.filter(p => p !== value);
        }
    } else if (type === 'assignee') {
        if (checked && !selectedAssignees.includes(value)) {
            selectedAssignees.push(value);
        } else if (!checked) {
            selectedAssignees = selectedAssignees.filter(a => a !== value);
        }
    } else if (type === 'sprint') {
        if (checked && !selectedSprints.includes(value)) {
            selectedSprints.push(value);
        } else if (!checked) {
            selectedSprints = selectedSprints.filter(s => s !== value);
        }
    } else if (type === 'epic') {
        if (checked && !selectedEpics.includes(value)) {
            selectedEpics.push(value);
        } else if (!checked) {
            selectedEpics = selectedEpics.filter(e => e !== value);
        }
    }
}
window.updateFilterSelection = updateFilterSelection;

function getUniqueValues(field, fallback) {
    const uniqueSet = new Set();
    // Use regular for loop instead of map to prevent stack overflow
    for (let i = 0; i < rawData.length; i++) {
        const value = rawData[i][field] || fallback;
        if (value) uniqueSet.add(value);
    }
    return Array.from(uniqueSet).sort();
}
window.getUniqueValues = getUniqueValues; // Export for analytics.js

function getUniqueSprintValues() {
    const sprintSet = new Set();
    // Use regular for loop for better performance
    for (let i = 0; i < rawData.length; i++) {
        const sprints = rawData[i].sprint || [];
        if (Array.isArray(sprints) && sprints.length > 0) {
            for (let j = 0; j < sprints.length; j++) {
                sprintSet.add(sprints[j]);
            }
        } else {
            sprintSet.add('Без спринта');
        }
    }
    return Array.from(sprintSet).sort();
}
window.getUniqueSprintValues = getUniqueSprintValues; // Export for analytics.js

function openFiltersModal() {
    filtersModal.style.display = 'block';
}
window.openFiltersModal = openFiltersModal;

function closeFiltersModal() {
    filtersModal.style.display = 'none';
}
window.closeFiltersModal = closeFiltersModal;

function applyFilters() {
    closeFiltersModal();
    updateFilterSummary();
    
    // Update filter display in Trends tab
    if (typeof updateTrendsFilters === 'function') {
        updateTrendsFilters();
    }
    
    updateDashboard();
    
    // Update trends if on trends tab
    if (typeof currentMainTab !== 'undefined' && currentMainTab === 'trends') {
        if (typeof renderTrends === 'function') {
            renderTrends();
        }
    }
    
    // Update sprints if on sprints tab and sprint is selected
    if (typeof currentMainTab !== 'undefined' && currentMainTab === 'sprints') {
        const selector = document.getElementById('sprintSelect');
        if (selector && selector.value && typeof loadSprintAnalysis === 'function') {
            loadSprintAnalysis();
        }
    }
}
window.applyFilters = applyFilters;

function selectAllBoards() {
    const boards = getUniqueValues('board', 'No Board');
    selectedBoards = [...boards];
    boards.forEach(b => {
        const checkbox = document.getElementById(`board-${escapeId(b)}`);
        if (checkbox) checkbox.checked = true;
    });
}
window.selectAllBoards = selectAllBoards;

function selectNoneBoards() {
    selectedBoards = [];
    const boards = getUniqueValues('board', 'No Board');
    boards.forEach(b => {
        const checkbox = document.getElementById(`board-${escapeId(b)}`);
        if (checkbox) checkbox.checked = false;
    });
}
window.selectNoneBoards = selectNoneBoards;

function selectAllProjects() {
    const projects = getUniqueValues('project_key', 'Unknown');
    selectedProjects = [...projects];
    projects.forEach(p => {
        const checkbox = document.getElementById(`project-${escapeId(p)}`);
        if (checkbox) checkbox.checked = true;
    });
}
window.selectAllProjects = selectAllProjects;

function selectNoneProjects() {
    selectedProjects = [];
    const projects = getUniqueValues('project_key', 'Unknown');
    projects.forEach(p => {
        const checkbox = document.getElementById(`project-${escapeId(p)}`);
        if (checkbox) checkbox.checked = false;
    });
}
window.selectNoneProjects = selectNoneProjects;

function selectAllAssignees() {
    const assignees = getUniqueValues('assignee', 'Не назначен');
    selectedAssignees = [...assignees];
    assignees.forEach(a => {
        const checkbox = document.getElementById(`assignee-${escapeId(a)}`);
        if (checkbox) checkbox.checked = true;
    });
}
window.selectAllAssignees = selectAllAssignees;

function selectNoneAssignees() {
    selectedAssignees = [];
    const assignees = getUniqueValues('assignee', 'Не назначен');
    assignees.forEach(a => {
        const checkbox = document.getElementById(`assignee-${escapeId(a)}`);
        if (checkbox) checkbox.checked = false;
    });
}
window.selectNoneAssignees = selectNoneAssignees;

function selectAllSprints() {
    const sprints = getUniqueSprintValues();
    selectedSprints = [...sprints];
    sprints.forEach(s => {
        const checkbox = document.getElementById(`sprint-${escapeId(s)}`);
        if (checkbox) checkbox.checked = true;
    });
}
window.selectAllSprints = selectAllSprints;

function selectNoneSprints() {
    selectedSprints = [];
    const sprints = getUniqueSprintValues();
    sprints.forEach(s => {
        const checkbox = document.getElementById(`sprint-${escapeId(s)}`);
        if (checkbox) checkbox.checked = false;
    });
}
window.selectNoneSprints = selectNoneSprints;

function selectAllEpics() {
    const epics = getUniqueValues('epic_link', 'Без эпика');
    selectedEpics = [...epics];
    epics.forEach(e => {
        const checkbox = document.getElementById(`epic-${escapeId(e)}`);
        if (checkbox) checkbox.checked = true;
    });
}
window.selectAllEpics = selectAllEpics;

function selectNoneEpics() {
    selectedEpics = [];
    const epics = getUniqueValues('epic_link', 'Без эпика');
    epics.forEach(e => {
        const checkbox = document.getElementById(`epic-${escapeId(e)}`);
        if (checkbox) checkbox.checked = false;
    });
}
window.selectNoneEpics = selectNoneEpics;

function updateFilterSummary() {
    const boards = getUniqueValues('board', 'No Board');
    const projects = getUniqueValues('project_key', 'Unknown');
    const assignees = getUniqueValues('assignee', 'Не назначен');
    const sprints = getUniqueSprintValues();
    const epics = getUniqueValues('epic_link', 'Без эпика');
    
    // Compact summary removed - we only use tag cloud now
    // (keeping this function for compatibility with existing code)
    
    // Update detailed filters info block (tag cloud)
    updateFiltersInfoBlock(boards, projects, assignees, sprints, epics);
}

function updateFiltersInfoBlock(allBoards, allProjects, allAssignees, allSprints, allEpics) {
    const container = document.getElementById('filterTagsContainer');
    if (!container) return;
    
    const tags = [];
    
    // Boards
    if (selectedBoards.length > 0 && selectedBoards.length < allBoards.length) {
        if (selectedBoards.length <= 3) {
            selectedBoards.forEach(board => {
                tags.push({ type: 'board', text: board, icon: '📌' });
            });
        } else {
            tags.push({ type: 'board', text: `${selectedBoards.length} направлений`, icon: '📌', count: selectedBoards.length });
        }
    } else if (selectedBoards.length === allBoards.length || selectedBoards.length === 0) {
        tags.push({ type: 'board', text: 'Все направления', icon: '📌', allSelected: true });
    }
    
    // Projects
    if (selectedProjects.length > 0 && selectedProjects.length < allProjects.length) {
        if (selectedProjects.length <= 3) {
            selectedProjects.forEach(project => {
                tags.push({ type: 'project', text: project, icon: '📁' });
            });
        } else {
            tags.push({ type: 'project', text: `${selectedProjects.length} проектов`, icon: '📁', count: selectedProjects.length });
        }
    } else if (selectedProjects.length === allProjects.length || selectedProjects.length === 0) {
        tags.push({ type: 'project', text: 'Все проекты', icon: '📁', allSelected: true });
    }
    
    // Assignees
    if (selectedAssignees.length > 0 && selectedAssignees.length < allAssignees.length) {
        if (selectedAssignees.length <= 3) {
            selectedAssignees.forEach(assignee => {
                tags.push({ type: 'assignee', text: assignee, icon: '👤' });
            });
        } else {
            tags.push({ type: 'assignee', text: `${selectedAssignees.length} исполнителей`, icon: '👤', count: selectedAssignees.length });
        }
    } else if (selectedAssignees.length === allAssignees.length || selectedAssignees.length === 0) {
        tags.push({ type: 'assignee', text: 'Все исполнители', icon: '👤', allSelected: true });
    }
    
    // Sprints
    if (selectedSprints.length > 0 && selectedSprints.length < allSprints.length) {
        if (selectedSprints.length <= 2) {
            selectedSprints.forEach(sprint => {
                if (sprint !== 'Без спринта') {
                    tags.push({ type: 'sprint', text: sprint, icon: '🏃' });
                }
            });
        } else {
            tags.push({ type: 'sprint', text: `${selectedSprints.length} спринтов`, icon: '🏃', count: selectedSprints.length });
        }
    } else if (selectedSprints.length === allSprints.length || selectedSprints.length === 0) {
        tags.push({ type: 'sprint', text: 'Все спринты', icon: '🏃', allSelected: true });
    }
    
    // Epics
    if (selectedEpics.length > 0 && selectedEpics.length < allEpics.length) {
        if (selectedEpics.length <= 2) {
            selectedEpics.forEach(epic => {
                if (epic !== 'Без эпика') {
                    tags.push({ type: 'epic', text: epic, icon: '📖' });
                }
            });
        } else {
            tags.push({ type: 'epic', text: `${selectedEpics.length} эпиков`, icon: '📖', count: selectedEpics.length });
        }
    } else if (selectedEpics.length === allEpics.length || selectedEpics.length === 0) {
        tags.push({ type: 'epic', text: 'Все эпики', icon: '📖', allSelected: true });
    }
    
    // Render tags
    container.innerHTML = tags.map(tag => {
        const allClass = tag.allSelected ? ' all-selected' : '';
        return `
            <span class="filter-tag ${tag.type}-tag${allClass}" onclick="openFiltersFromTag('${tag.type}')">
                <span class="filter-tag-icon">${tag.icon}</span>
                <span>${tag.text}</span>
            </span>
        `;
    }).join('');
}

function openFiltersFromTag(filterType) {
    // Open the filters modal
    const modal = document.getElementById('filtersModalShared');
    if (modal) {
        modal.style.display = 'block';
    }
    
    // Scroll to the relevant section in the modal
    setTimeout(() => {
        let targetSection = null;
        
        switch(filterType) {
            case 'board':
                targetSection = document.querySelector('#boardCheckboxList')?.closest('.filter-column');
                break;
            case 'project':
                targetSection = document.querySelector('#projectCheckboxList')?.closest('.filter-column');
                break;
            case 'assignee':
                targetSection = document.querySelector('#assigneeCheckboxList')?.closest('.filter-column');
                break;
            case 'sprint':
                targetSection = document.querySelector('#sprintCheckboxList')?.closest('.filter-column');
                break;
            case 'epic':
                targetSection = document.querySelector('#epicCheckboxList')?.closest('.filter-column');
                break;
        }
        
        if (targetSection) {
            targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Add highlight effect
            targetSection.style.background = '#fffbea';
            targetSection.style.transition = 'background 0.3s ease';
            setTimeout(() => {
                targetSection.style.background = '';
            }, 1500);
        }
    }, 100);
}
window.openFiltersFromTag = openFiltersFromTag;

function resetFilters() {
    console.log('🔄 Resetting all filters...');
    
    const boards = getUniqueValues('board', 'No Board');
    const projects = getUniqueValues('project_key', 'Unknown');
    const assignees = getUniqueValues('assignee', 'Не назначен');
    const sprints = getUniqueSprintValues();
    const epics = getUniqueValues('epic_link', 'Без эпика');
    
    selectedBoards = [...boards];
    selectedProjects = [...projects];
    selectedAssignees = [...assignees];
    selectedSprints = [...sprints];
    selectedEpics = [...epics];
    
    // Reset date filter
    dateFilter.enabled = false;
    dateFilter.from = null;
    dateFilter.to = null;
    updateDateFilterTag();
    
    // Update checkboxes
    boards.forEach(b => {
        const checkbox = document.getElementById(`board-${escapeId(b)}`);
        if (checkbox) checkbox.checked = true;
    });
    
    projects.forEach(p => {
        const checkbox = document.getElementById(`project-${escapeId(p)}`);
        if (checkbox) checkbox.checked = true;
    });
    
    assignees.forEach(a => {
        const checkbox = document.getElementById(`assignee-${escapeId(a)}`);
        if (checkbox) checkbox.checked = true;
    });
    
    sprints.forEach(s => {
        const checkbox = document.getElementById(`sprint-${escapeId(s)}`);
        if (checkbox) checkbox.checked = true;
    });
    
    epics.forEach(e => {
        const checkbox = document.getElementById(`epic-${escapeId(e)}`);
        if (checkbox) checkbox.checked = true;
    });
    
    currentGrouping = 'project';
    document.querySelector('input[name="viewMode"][value="project"]').checked = true;
    
    // Reset sort
    currentSort = { field: 'rawTotal', direction: 'desc' };
    
    console.log('✓ Filters reset, updating dashboard...');
    updateFilterSummary();
    updateDashboard();
    
    // Update trends/sprints if on those tabs
    if (typeof currentMainTab !== 'undefined' && currentMainTab === 'trends') {
        if (typeof renderTrends === 'function') {
            renderTrends();
        }
    }
    if (typeof currentMainTab !== 'undefined' && currentMainTab === 'sprints') {
        const selector = document.getElementById('sprintSelect');
        if (selector && selector.value && typeof loadSprintAnalysis === 'function') {
            loadSprintAnalysis();
        }
    }
}

function filterData() {
    // Use regular for loop to prevent stack overflow on large datasets
    const filtered = [];
    
    for (let i = 0; i < rawData.length; i++) {
        const item = rawData[i];
        const pKey = item.project_key || 'Unknown';
        const aName = item.assignee || 'Не назначен';
        const board = item.board || 'No Board';
        const epic = item.epic_link || 'Без эпика';
        const sprints = Array.isArray(item.sprint) && item.sprint.length > 0 ? item.sprint : ['Без спринта'];

        // Multi-select filters
        const matchBoard = selectedBoards.length === 0 || selectedBoards.includes(board);
        const matchProject = selectedProjects.length === 0 || selectedProjects.includes(pKey);
        const matchAssignee = selectedAssignees.length === 0 || selectedAssignees.includes(aName);
        const matchEpic = selectedEpics.length === 0 || selectedEpics.includes(epic);
        
        // Check sprint match manually
        let matchSprint = selectedSprints.length === 0;
        if (!matchSprint) {
            for (let j = 0; j < sprints.length; j++) {
                if (selectedSprints.includes(sprints[j])) {
                    matchSprint = true;
                    break;
                }
            }
        }
        
        if (matchBoard && matchProject && matchAssignee && matchEpic && matchSprint) {
            filtered.push(item);
        }
    }
    
    return filtered;
}
window.filterData = filterData; // Export for analytics.js

// Helper function to check if task is a CR
function isCR(item) {
    // Only count for specific boards
    const board = (item.board || '').toLowerCase();
    const allowedBoards = ['ios', 'android', 'flutter', 'frontend', 'backend'];
    if (!allowedBoards.includes(board)) {
        return false;
    }
    
    // Check components - use for loop instead of some()
    const components = Array.isArray(item.components) ? item.components : [];
    let hasCRComponent = false;
    for (let i = 0; i < components.length; i++) {
        if ((components[i] || '').toLowerCase() === 'cr') {
            hasCRComponent = true;
            break;
        }
    }
    
    // Check labels - use for loop instead of some()
    const labels = Array.isArray(item.labels) ? item.labels : [];
    let hasCRLabel = false;
    for (let i = 0; i < labels.length; i++) {
        if ((labels[i] || '').toLowerCase() === 'cr') {
            hasCRLabel = true;
            break;
        }
    }
    
    // Check type = Improvement
    const type = (item.issuetype || '').toLowerCase();
    const isImprovement = type === 'improvement';
    
    // Check summary contains "CR" or "Доработка"
    const summary = item.summary || '';
    const hasCRInSummary = /\bCR\b/i.test(summary);
    const hasDorabotkaInSummary = /доработка/i.test(summary);
    
    return hasCRComponent || hasCRLabel || isImprovement || hasCRInSummary || hasDorabotkaInSummary;
}
window.isCR = isCR; // Export for analytics.js

function calculateMetrics(data, groupByField) {
    const groups = {};

    // Use regular for loop for better performance on large datasets
    for (let idx = 0; idx < data.length; idx++) {
        const item = data[idx];
        // Determine Key based on grouping
        let keys = [];
        
        if (groupByField === 'project') {
            keys = [item.project_key || 'Unknown'];
        } else if (groupByField === 'assignee') {
            keys = [item.assignee || 'Не назначен'];
        } else if (groupByField === 'board') {
            keys = [item.board || 'No Board'];
        } else if (groupByField === 'month') {
            // Group by resolution month
            if (item.resolutiondate) {
                const date = new Date(item.resolutiondate);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                keys = [`${year}-${month}`];
            } else {
                keys = ['Не завершено'];
            }
        } else if (groupByField === 'sprint') {
            // Task can belong to multiple sprints
            const sprints = Array.isArray(item.sprint) && item.sprint.length > 0 
                ? item.sprint 
                : ['Без спринта'];
            keys = sprints;
        } else if (groupByField === 'epic') {
            keys = [item.epic_link || 'Без эпика'];
        }

        // Add item to all relevant groups (for sprint case)
        for (let k = 0; k < keys.length; k++) {
            const key = keys[k];
            if (!groups[key]) {
                groups[key] = {
                    name: key,
                    taskTimeSpent: 0,
                    bugTimeSpent: 0,
                    bugTimeSpentClosed: 0, // NEW: only closed bugs
                    serviceTaskTimeSpent: 0,
                    totalTimeSpent: 0,
                    totalTimeSpentForDebug: 0, // NEW: total time on allowed boards
                    originalEstimateSum: 0,
                    timeSpentForPerf: 0,
                    crCount: 0,
                    cycleTimes: [],
                    itemCount: 0
                };
            }

            const m = groups[key];
            m.itemCount++;

            const type = (item.issuetype || '').toLowerCase();
            const timeSpent = parseInt(item.timespent || 0, 10);
            const est = parseInt(item.timeoriginalestimate || 0, 10);
            
            // Check if board is allowed for debug calculation
            const board = (item.board || '').toLowerCase();
            const allowedBoards = ['flutter', 'ios', 'android', 'frontend', 'backend'];
            const isAllowedBoard = allowedBoards.includes(board);

            // Time Buckets
            if (type === 'bug' || type === 'incident') {
                m.bugTimeSpent += timeSpent;
                // Only count closed bugs/incidents on allowed boards for debug ratio
                if (isAllowedBoard && item.resolutiondate) {
                    m.bugTimeSpentClosed += timeSpent;
                }
            } else if (type === 'task') {
                m.taskTimeSpent += timeSpent;
            } else if (type.includes('service')) { 
                m.serviceTaskTimeSpent += timeSpent;
            }
            m.totalTimeSpent += timeSpent;
            
            // Total time for debug calculation (only on allowed boards)
            if (isAllowedBoard) {
                m.totalTimeSpentForDebug += timeSpent;
            }

            // Performance (exclude service tasks)
            if (timeSpent > 0 && !type.includes('service')) {
                m.timeSpentForPerf += timeSpent;
                m.originalEstimateSum += est;
            }

            // Cycle Time
            if (type === 'task') {
                if (item.task_cycle_seconds && item.task_cycle_seconds > 0) {
                    m.cycleTimes.push(item.task_cycle_seconds);
                } else if (item.resolutiondate && item.created) {
                    const start = new Date(item.created);
                    const end = new Date(item.resolutiondate);
                    const seconds = (end - start) / 1000;
                    if (seconds > 0) m.cycleTimes.push(seconds);
                }
            }

            // CR Count - use helper function
            if (isCR(item)) {
                m.crCount++;
            }
        }
    }

    // Final Aggregation - use for loop instead of map
    const groupValues = Object.values(groups);
    const results = [];
    
    for (let i = 0; i < groupValues.length; i++) {
        const p = groupValues[i];
        
        // Calculate average cycle time manually
        let avgCycleSeconds = 0;
        if (p.cycleTimes.length > 0) {
            let sum = 0;
            for (let j = 0; j < p.cycleTimes.length; j++) {
                sum += p.cycleTimes[j];
            }
            avgCycleSeconds = sum / p.cycleTimes.length;
        }
        
        const performance = p.timeSpentForPerf > 0 
            ? (p.originalEstimateSum / p.timeSpentForPerf) 
            : 0;

        // Debug ratio: закрытые баги на разрешенных досках / всё время на разрешенных досках
        const debugRatio = p.totalTimeSpentForDebug > 0 
            ? (p.bugTimeSpentClosed / p.totalTimeSpentForDebug) 
            : 0;

        const commRatio = p.totalTimeSpent > 0 
            ? (p.serviceTaskTimeSpent / p.totalTimeSpent) 
            : 0;

        results.push({
            name: p.name,
            avgCycleDays: (avgCycleSeconds / (3600 * 24)).toFixed(1),
            avgCycleHours: (avgCycleSeconds / 3600).toFixed(1),
            performance: (performance * 100).toFixed(1),
            debugRatio: (debugRatio * 100).toFixed(1),
            commRatio: (commRatio * 100).toFixed(1),
            crCount: p.crCount,
            // Raw values for charts & sorting
            rawDebug: p.bugTimeSpentClosed, // Only closed bugs on allowed boards
            rawDebugTotal: p.totalTimeSpentForDebug, // Total time on allowed boards
            rawTask: p.taskTimeSpent,
            rawService: p.serviceTaskTimeSpent,
            rawTotal: p.totalTimeSpent,
            
            // Sort keys
            sortName: p.name,
            sortCycle: avgCycleSeconds,
            sortPerf: performance,
            sortDebug: debugRatio,
            sortComm: commRatio,
            sortCR: p.crCount
        });
    }

    return results;
}

function sortMetrics(metrics) {
    return metrics.sort((a, b) => {
        let valA = a[currentSort.field];
        let valB = b[currentSort.field];

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
}

function updateDashboard() {
    try {
        console.log('  → filterData()...');
        const filteredData = filterData();
        console.log(`  ✓ Filtered to ${filteredData.length} items`);
        
        console.log('  → updateDateRange()...');
        updateDateRange();
        console.log('  ✓ Date range updated');
        
        console.log('  → calculateMetrics()...');
        let metrics = calculateMetrics(filteredData, currentGrouping);
        console.log(`  ✓ Calculated ${metrics.length} metrics`);
        
        console.log('  → sortMetrics()...');
        metrics = sortMetrics(metrics);
        console.log('  ✓ Sorted');

        console.log('  → updateUIText()...');
        updateUIText();
        console.log('  ✓ UI text updated');
        
        console.log('  → updateSortIcons()...');
        updateSortIcons();
        console.log('  ✓ Sort icons updated');
        
        console.log('  → renderSummary()...');
        renderSummary(metrics, filteredData);
        console.log('  ✓ Summary rendered');
        
        console.log('  → renderTable()...');
        renderTable(metrics);
        console.log('  ✓ Table rendered');
        
        console.log('  → renderCharts()...');
        renderCharts(metrics);
        console.log('  ✓ Charts rendered');
    } catch (e) {
        console.error('❌ Error in updateDashboard:', e);
        throw e;
    }
}

function handleSort(field) {
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        if (field === 'sortName') currentSort.direction = 'asc';
        else currentSort.direction = 'desc';
    }
    updateDashboard();
}
window.handleSort = handleSort;

function updateSortIcons() {
    document.querySelectorAll('.sort-icon').forEach(el => el.textContent = '');
    const iconId = `icon-${currentSort.field}`;
    const iconEl = document.getElementById(iconId);
    if (iconEl) {
        iconEl.textContent = currentSort.direction === 'asc' ? ' ▲' : ' ▼';
    }
}

function updateUIText() {
    const searchInput = document.getElementById('metricsTableSearch');
    
    if (currentGrouping === 'project') {
        tableTitle.textContent = 'Детальные метрики по Проектам';
        colName.innerHTML = `Проект <span id="icon-sortName" class="sort-icon"></span>`;
        colName.onclick = () => handleSort('sortName');
        colName.classList.add('sortable');
        if (searchInput) {
            searchInput.style.display = 'none';
            searchInput.placeholder = '🔍 Поиск по проекту...';
        }
    } else if (currentGrouping === 'assignee') {
        tableTitle.textContent = 'Детальные метрики по Сотрудникам';
        colName.innerHTML = `Исполнитель <span id="icon-sortName" class="sort-icon"></span>`;
        colName.onclick = () => handleSort('sortName');
        colName.classList.add('sortable');
        if (searchInput) {
            searchInput.style.display = 'block';
            searchInput.placeholder = '🔍 Поиск по сотруднику...';
        }
    } else if (currentGrouping === 'board') {
        tableTitle.textContent = 'Детальные метрики по Направлениям';
        colName.innerHTML = `Направление <span id="icon-sortName" class="sort-icon"></span>`;
        colName.onclick = () => handleSort('sortName');
        colName.classList.add('sortable');
        if (searchInput) {
            searchInput.style.display = 'none';
            searchInput.placeholder = '🔍 Поиск по направлению...';
        }
    } else if (currentGrouping === 'month') {
        tableTitle.textContent = 'Детальные метрики по Месяцам';
        colName.innerHTML = `Месяц <span id="icon-sortName" class="sort-icon"></span>`;
        colName.onclick = () => handleSort('sortName');
        colName.classList.add('sortable');
        if (searchInput) {
            searchInput.style.display = 'none';
            searchInput.placeholder = '🔍 Поиск...';
        }
    } else if (currentGrouping === 'sprint') {
        tableTitle.textContent = 'Детальные метрики по Спринтам';
        colName.innerHTML = `Спринт <span id="icon-sortName" class="sort-icon"></span>`;
        colName.onclick = () => handleSort('sortName');
        colName.classList.add('sortable');
        if (searchInput) {
            searchInput.style.display = 'none';
            searchInput.placeholder = '🔍 Поиск по спринту...';
        }
    } else if (currentGrouping === 'epic') {
        tableTitle.textContent = 'Детальные метрики по Эпикам';
        colName.innerHTML = `Эпик <span id="icon-sortName" class="sort-icon"></span>`;
        colName.onclick = () => handleSort('sortName');
        colName.classList.add('sortable');
        if (searchInput) {
            searchInput.style.display = 'none';
            searchInput.placeholder = '🔍 Поиск по эпику...';
        }
    }
}

function renderSummary(metrics, rawData) {
    console.log(`📊 renderSummary called with ${rawData.length} items`);
    
    // -- Aggregations (Weighted Averages) --
    
    // 1. Performance: Sum(Est) / Sum(Spent)
    let totalEst = 0;
    let totalSpentPerf = 0;
    
    // 2. Cycle Time: Sum(CycleTimes) / Count
    let totalCycleTime = 0;
    let cycleCount = 0;
    let totalCycleTimeNoBugs = 0;
    let cycleCountNoBugs = 0;

    // 3. Debug: Sum(BugSpent on allowed boards) / Sum(TotalSpent on allowed boards)
    let totalBugSpentClosed = 0; // Only closed bugs on allowed boards
    let totalTimeSpentOnAllowedBoards = 0; // All time on allowed boards

    // 4. Comm: Sum(ServiceSpent) / Sum(TotalSpent)
    let totalServiceSpent = 0;
    let grandTotalSpent = 0;

    // 5. CRs
    let totalCR = 0;

    // Use for loop instead of forEach - CRITICAL for large datasets!
    for (let i = 0; i < rawData.length; i++) {
        const item = rawData[i];
        const type = (item.issuetype || '').toLowerCase();
        const timeSpent = parseInt(item.timespent || 0, 10);
        const est = parseInt(item.timeoriginalestimate || 0, 10);
        
        // Check if board is allowed for debug calculation
        const board = (item.board || '').toLowerCase();
        const allowedBoards = ['flutter', 'ios', 'android', 'frontend', 'backend'];
        const isAllowedBoard = allowedBoards.includes(board);

        // Performance (exclude service tasks)
        if (timeSpent > 0 && !type.includes('service')) {
            totalEst += est;
            totalSpentPerf += timeSpent;
        }

        // Cycle Time (for all tasks and bugs with resolution)
        if (item.resolutiondate && item.created) {
            let seconds = 0;
            if (item.task_cycle_seconds && item.task_cycle_seconds > 0) {
                seconds = item.task_cycle_seconds;
            } else {
                const start = new Date(item.created);
                const end = new Date(item.resolutiondate);
                const s = (end - start) / 1000;
                if (s > 0) seconds = s;
            }
            
            if (seconds > 0) {
                totalCycleTime += seconds;
                cycleCount++;
                
                // Count separately without bugs
                if (type !== 'bug' && type !== 'incident') {
                    totalCycleTimeNoBugs += seconds;
                    cycleCountNoBugs++;
                }
            }
        }

        // Debug: Only count closed bugs/incidents on allowed boards
        if ((type === 'bug' || type === 'incident') && isAllowedBoard && item.resolutiondate) {
            totalBugSpentClosed += timeSpent;
        }
        
        // Total time on allowed boards for debug calculation
        if (isAllowedBoard) {
            totalTimeSpentOnAllowedBoards += timeSpent;
        }
        
        // Comm: service tasks
        if (type.includes('service')) {
            totalServiceSpent += timeSpent;
        }
        
        grandTotalSpent += timeSpent;

        // CR Count - use helper function
        if (isCR(item)) {
            totalCR++;
        }
    }

    // Calculate Final Metrics
    const avgPerf = totalSpentPerf > 0 ? (totalEst / totalSpentPerf * 100).toFixed(1) : 0;
    const avgCycle = cycleCount > 0 ? (totalCycleTime / cycleCount / (3600 * 24)).toFixed(1) : 0;
    const avgCycleNoBugs = cycleCountNoBugs > 0 ? (totalCycleTimeNoBugs / cycleCountNoBugs / (3600 * 24)).toFixed(1) : 0;
    const avgDebug = totalTimeSpentOnAllowedBoards > 0 ? (totalBugSpentClosed / totalTimeSpentOnAllowedBoards * 100).toFixed(1) : 0;
    const avgComm = grandTotalSpent > 0 ? (totalServiceSpent / grandTotalSpent * 100).toFixed(1) : 0;

    console.log('📊 Calculation details:', {
        totalEst,
        totalSpentPerf,
        cycleCount,
        totalBugSpentClosed,
        totalTimeSpentOnAllowedBoards,
        totalServiceSpent,
        grandTotalSpent
    });
    
    console.log('📊 Final metrics:', {
        avgPerf: avgPerf + '%',
        avgCycle: avgCycle + ' дн.',
        avgDebug: avgDebug + '%',
        avgComm: avgComm + '%',
        totalCR
    });

    // UI Updates with color coding
    const avgPerfEl = document.getElementById('avgPerf');
    const avgCycleEl = document.getElementById('avgCycle');
    const avgDebugEl = document.getElementById('avgDebug');
    const avgCommEl = document.getElementById('avgComm');
    const totalCREl = document.getElementById('totalCR');
    
    // Update Performance
    avgPerfEl.textContent = avgPerf + '%';
    avgPerfEl.className = 'value';
    if (avgPerf >= 98) {
        avgPerfEl.classList.add('status-good');
    } else if (avgPerf >= 85) {
        avgPerfEl.classList.add('status-warning');
    } else {
        avgPerfEl.classList.add('status-danger');
    }
    
    // Update Cycle Time (show without bugs as main metric)
    avgCycleEl.textContent = avgCycleNoBugs + ' дн.';
    avgCycleEl.className = 'value';
    if (parseFloat(avgCycleNoBugs) > 5) {
        avgCycleEl.classList.add('status-danger');
    }
    
    // Update cycle details
    document.getElementById('avgCycleAll').textContent = avgCycle + ' дн.';
    document.getElementById('avgCycleNoBugs').textContent = avgCycleNoBugs + ' дн.';
    
    // Update Debug %
    avgDebugEl.textContent = avgDebug + '%';
    avgDebugEl.className = 'value';
    if (parseFloat(avgDebug) > 30) {
        avgDebugEl.classList.add('status-danger');
    }
    
    // Update Comm %
    avgCommEl.textContent = avgComm + '%';
    avgCommEl.className = 'value';
    const commValue = parseFloat(avgComm);
    if (commValue > 30) {
        avgCommEl.classList.add('status-danger');
    } else if (commValue > 15) {
        avgCommEl.classList.add('status-warning');
    }
    
    // Update CR Count
    totalCREl.textContent = totalCR;
    totalCREl.className = 'value';
    if (totalCR > 5) {
        totalCREl.classList.add('status-danger');
    }
}

function formatMonthName(monthKey) {
    if (monthKey === 'Не завершено') return monthKey;
    
    const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    const [year, month] = monthKey.split('-');
    const monthIndex = parseInt(month, 10) - 1;
    return `${months[monthIndex]} ${year}`;
}
window.formatMonthName = formatMonthName; // Export for analytics.js

function handleMetricsSearch() {
    const searchInput = document.getElementById('metricsTableSearch');
    if (searchInput) {
        metricsSearchQuery = searchInput.value;
        console.log('🔍 Searching metrics for:', metricsSearchQuery);
        
        // Re-render table with search filter
        const filteredData = filterData();
        const metrics = sortMetrics(calculateMetrics(filteredData, currentGrouping));
        renderTable(metrics);
    }
}
window.handleMetricsSearch = handleMetricsSearch;

function renderTable(metrics) {
    // Apply search filter if active
    let filteredMetrics = metrics;
    if (metricsSearchQuery && metricsSearchQuery.trim() !== '') {
        const query = metricsSearchQuery.toLowerCase().trim();
        filteredMetrics = metrics.filter(m => {
            const name = (m.name || '').toLowerCase();
            return name.includes(query);
        });
    }
    
    if (filteredMetrics.length === 0) {
        const message = metricsSearchQuery 
            ? `Ничего не найдено по запросу "${metricsSearchQuery}"` 
            : 'Нет данных для отображения';
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center">${message}</td></tr>`;
        return;
    }

    tableBody.innerHTML = filteredMetrics.map(m => {
        // Performance badge (higher is better)
        let perfBadge = '';
        const pVal = parseFloat(m.performance);
        if (pVal >= 98) perfBadge = 'badge-good';
        else if (pVal >= 85) perfBadge = 'badge-warn';
        else perfBadge = 'badge-bad';
        
        // Cycle Time badge (lower is better)
        let cycleBadge = '';
        const cycleVal = parseFloat(m.avgCycleDays);
        if (cycleVal <= 3) cycleBadge = 'badge-good';
        else if (cycleVal <= 5) cycleBadge = 'badge-warn';
        else cycleBadge = 'badge-bad';
        
        // Debug % badge (lower is better)
        let debugBadge = '';
        const debugVal = parseFloat(m.debugRatio);
        if (debugVal <= 20) debugBadge = 'badge-good';
        else if (debugVal <= 30) debugBadge = 'badge-warn';
        else debugBadge = 'badge-bad';
        
        // Comm % badge (lower is better)
        let commBadge = '';
        const commVal = parseFloat(m.commRatio);
        if (commVal <= 15) commBadge = 'badge-good';
        else if (commVal <= 30) commBadge = 'badge-warn';
        else commBadge = 'badge-bad';
        
        // CR Count badge (lower is better)
        let crBadge = '';
        const crVal = parseInt(m.crCount);
        if (crVal <= 3) crBadge = 'badge-good';
        else if (crVal <= 5) crBadge = 'badge-warn';
        else crBadge = 'badge-bad';
        
        // Format name for month view
        const displayName = currentGrouping === 'month' ? formatMonthName(m.name) : m.name;

        return `
        <tr class="clickable-row" onclick="openDetailsModal('${m.name}')">
            <td>${displayName}</td>
            <td><span class="badge ${cycleBadge}">${m.avgCycleDays} дн.</span></td>
            <td><span class="badge ${perfBadge}">${m.performance}%</span></td>
            <td><span class="badge ${debugBadge}">${m.debugRatio}%</span></td>
            <td><span class="badge ${commBadge}">${m.commRatio}%</span></td>
            <td><span class="badge ${crBadge}">${m.crCount}</span></td>
        </tr>
    `}).join('');
}

function renderCharts(metrics) {
    const labels = metrics.map(m => currentGrouping === 'month' ? formatMonthName(m.name) : m.name);
    const originalNames = metrics.map(m => m.name); // Keep original names for click handler
    
    updateChart('perfChart', 'bar', {
        labels: labels,
        datasets: [{
            label: 'Производительность (%)',
            data: metrics.map(m => m.performance),
            backgroundColor: 'rgba(52, 152, 219, 0.7)',
            borderColor: '#3498db',
            borderWidth: 1
        }]
    }, {
        scales: { y: { beginAtZero: true, title: { display: true, text: '%' } } },
        onClick: (event, elements) => handleChartClick(event, elements, originalNames)
    });

    updateChart('cycleChart', 'bar', {
        labels: labels,
        datasets: [{
            label: 'Ср. время выполнения (Дни)',
            data: metrics.map(m => m.avgCycleDays),
            backgroundColor: 'rgba(231, 76, 60, 0.7)',
            borderColor: '#e74c3c',
            borderWidth: 1
        }]
    }, {
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Дни' } } },
        onClick: (event, elements) => handleChartClick(event, elements, originalNames)
    });

    updateChart('distChart', 'bar', {
        labels: labels,
        datasets: [
            { label: 'Задачи', data: metrics.map(m => (m.rawTask / 3600).toFixed(0)), backgroundColor: '#2ecc71' },
            { label: 'Баги', data: metrics.map(m => (m.rawDebug / 3600).toFixed(0)), backgroundColor: '#e74c3c' },
            { label: 'Сервис', data: metrics.map(m => (m.rawService / 3600).toFixed(0)), backgroundColor: '#95a5a6' }
        ]
    }, {
        scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: 'Часов' }, grid: { color: '#f0f0f0' } } },
        plugins: {
            tooltip: {
                callbacks: {
                    afterBody: function(context) {
                        const idx = context[0].dataIndex;
                        const m = metrics[idx];
                        return `Отладка: ${m.debugRatio}%\nКоммуникации: ${m.commRatio}%`;
                    }
                }
            }
        },
        onClick: (event, elements) => handleChartClick(event, elements, originalNames)
    });
}

function handleChartClick(event, elements, labels) {
    if (elements.length > 0) {
        const index = elements[0].index;
        const clickedLabel = labels[index];
        // Open details modal for the clicked item
        openDetailsModal(clickedLabel);
    }
}

function updateChart(canvasId, type, data, options = {}) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    if (chartInstances[canvasId]) chartInstances[canvasId].destroy();
    chartInstances[canvasId] = new Chart(ctx, {
        type: type, data: data, options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom' } }, ...options
        }
    });
}

// --- Task Details Modal Logic ---
let currentDetailName = '';
let currentDetailData = []; // Store raw tasks for tabs

// Task Filter State
let taskFilters = {
    type: 'all',
    priority: 'all',
    severity: 'all',
    board: 'all'
};

// Task Search State
let taskSearchQuery = '';

// Task Sort State
let taskSort = {
    field: 'overtime',
    direction: 'desc'
};

function openDetailsModal(name) {
    currentDetailName = name;
    const filteredData = filterData();
    
    // Filter group items based on current grouping
    currentDetailData = filteredData.filter(item => {
        if (currentGrouping === 'project') {
            return (item.project_key || 'Unknown') === name;
        } else if (currentGrouping === 'assignee') {
            return (item.assignee || 'Не назначен') === name;
        } else if (currentGrouping === 'board') {
            return (item.board || 'No Board') === name;
        } else if (currentGrouping === 'month') {
            if (name === 'Не завершено') {
                return !item.resolutiondate;
            }
            if (item.resolutiondate) {
                const date = new Date(item.resolutiondate);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                return `${year}-${month}` === name;
            }
            return false;
        } else if (currentGrouping === 'sprint') {
            const sprints = Array.isArray(item.sprint) && item.sprint.length > 0 
                ? item.sprint 
                : ['Без спринта'];
            return sprints.includes(name);
        } else if (currentGrouping === 'epic') {
            return (item.epic_link || 'Без эпика') === name;
        }
        return false;
    });

    // Setup Header
    detailsTitle.textContent = `Детали: ${name} (${currentDetailData.length} задач)`;
    
    // Show drill-down button only for project view
    if (currentGrouping === 'project') drillDownControls.style.display = 'block';
    else drillDownControls.style.display = 'none';

    // Reset filters
    taskFilters = { type: 'all', priority: 'all', severity: 'all', board: 'all', project: 'all' };
    taskSort = { field: 'overtime', direction: 'desc' };
    taskSearchQuery = '';
    
    // Clear search input
    const searchInput = document.getElementById('taskSearchInput');
    if (searchInput) searchInput.value = '';
    document.getElementById('clearSearchBtn').style.display = 'none';
    
    // Populate task filters
    populateTaskFilters();

    // Default to first tab
    switchDetailTab('tasks');
    
    detailsModal.style.display = 'block';
}
window.openDetailsModal = openDetailsModal;

function closeDetails() { 
    detailsModal.style.display = 'none'; 
}
window.closeDetails = closeDetails;

function populateTaskFilters() {
    const types = [...new Set(currentDetailData.map(i => i.issuetype || 'Unknown'))].sort();
    const priorities = [...new Set(currentDetailData.map(i => i.priority || 'None'))].sort();
    const severities = [...new Set(currentDetailData.map(i => i.severity || 'None'))].sort();
    const boards = [...new Set(currentDetailData.map(i => i.board || 'No Board'))].sort();
    const projects = [...new Set(currentDetailData.map(i => i.project_key || 'Unknown'))].sort();

    const typeSelect = document.getElementById('taskTypeFilter');
    const prioritySelect = document.getElementById('taskPriorityFilter');
    const severitySelect = document.getElementById('taskSeverityFilter');
    const boardSelect = document.getElementById('taskBoardFilter');
    const projectSelect = document.getElementById('taskProjectFilter');

    // Clear existing options (except "all")
    typeSelect.innerHTML = '<option value="all">Все типы</option>';
    prioritySelect.innerHTML = '<option value="all">Все приоритеты</option>';
    severitySelect.innerHTML = '<option value="all">Все severity</option>';
    boardSelect.innerHTML = '<option value="all">Все boards</option>';
    projectSelect.innerHTML = '<option value="all">Все проекты</option>';

    types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        typeSelect.appendChild(opt);
    });

    priorities.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        prioritySelect.appendChild(opt);
    });

    severities.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        severitySelect.appendChild(opt);
    });

    boards.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = b;
        boardSelect.appendChild(opt);
    });

    projects.forEach(proj => {
        const opt = document.createElement('option');
        opt.value = proj;
        opt.textContent = proj;
        projectSelect.appendChild(opt);
    });

    // Add event listeners
    typeSelect.addEventListener('change', (e) => {
        taskFilters.type = e.target.value;
        renderTaskList();
    });

    prioritySelect.addEventListener('change', (e) => {
        taskFilters.priority = e.target.value;
        renderTaskList();
    });

    severitySelect.addEventListener('change', (e) => {
        taskFilters.severity = e.target.value;
        renderTaskList();
    });

    boardSelect.addEventListener('change', (e) => {
        taskFilters.board = e.target.value;
        renderTaskList();
    });

    projectSelect.addEventListener('change', (e) => {
        taskFilters.project = e.target.value;
        renderTaskList();
    });
}

function resetTaskFilters() {
    taskFilters = { type: 'all', priority: 'all', severity: 'all', board: 'all', project: 'all' };
    taskSearchQuery = '';
    document.getElementById('taskTypeFilter').value = 'all';
    document.getElementById('taskPriorityFilter').value = 'all';
    document.getElementById('taskSeverityFilter').value = 'all';
    document.getElementById('taskBoardFilter').value = 'all';
    document.getElementById('taskProjectFilter').value = 'all';
    document.getElementById('taskSearchInput').value = '';
    document.getElementById('clearSearchBtn').style.display = 'none';
    renderTaskList();
}
window.resetTaskFilters = resetTaskFilters;

function handleTaskSearch() {
    const searchInput = document.getElementById('taskSearchInput');
    taskSearchQuery = searchInput.value.trim();
    
    // Show/hide clear button
    const clearBtn = document.getElementById('clearSearchBtn');
    clearBtn.style.display = taskSearchQuery ? 'block' : 'none';
    
    renderTaskList();
}
window.handleTaskSearch = handleTaskSearch;

function clearTaskSearch() {
    document.getElementById('taskSearchInput').value = '';
    taskSearchQuery = '';
    document.getElementById('clearSearchBtn').style.display = 'none';
    renderTaskList();
}
window.clearTaskSearch = clearTaskSearch;

function switchDetailTab(tabName) {
    // Update Buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.tab-btn[onclick="switchDetailTab('${tabName}')"]`);
    if(activeBtn) activeBtn.classList.add('active');

    // Show/Hide Content
    document.getElementById('tab-tasks').style.display = tabName === 'tasks' ? 'block' : 'none';
    document.getElementById('tab-bugs').style.display = tabName === 'bugs' ? 'block' : 'none';

    if (tabName === 'tasks') renderTaskList();
    if (tabName === 'bugs') renderBugAnalysis();
}
window.switchDetailTab = switchDetailTab;

function renderTaskList() {
    // Apply filters
    let filteredTasks = currentDetailData.filter(item => {
        const matchType = taskFilters.type === 'all' || (item.issuetype || 'Unknown') === taskFilters.type;
        const matchPriority = taskFilters.priority === 'all' || (item.priority || 'None') === taskFilters.priority;
        const matchSeverity = taskFilters.severity === 'all' || (item.severity || 'None') === taskFilters.severity;
        const matchBoard = taskFilters.board === 'all' || (item.board || 'No Board') === taskFilters.board;
        const matchProject = taskFilters.project === 'all' || (item.project_key || 'Unknown') === taskFilters.project;
        
        // Search filter
        let matchSearch = true;
        if (taskSearchQuery) {
            const query = taskSearchQuery.toLowerCase();
            const searchableText = [
                item.summary || '',
                item.key || '',
                item.issuetype || '',
                item.priority || '',
                item.severity || '',
                item.board || '',
                item.assignee || '',
                item.description || '',
                item.project_key || ''
            ].join(' ').toLowerCase();
            
            matchSearch = searchableText.includes(query);
        }
        
        return matchType && matchPriority && matchSeverity && matchBoard && matchProject && matchSearch;
    });

    // Transform to display format
    let tasks = filteredTasks.map(item => {
        const spent = parseInt(item.timespent || 0, 10);
        const est = parseInt(item.timeoriginalestimate || 0, 10);
        
        // Calculate cycle time (task_cycle_seconds or created -> resolutiondate)
        let cycleSeconds = 0;
        if (item.task_cycle_seconds && item.task_cycle_seconds > 0) {
            cycleSeconds = item.task_cycle_seconds;
        } else if (item.resolutiondate && item.created) {
            const start = new Date(item.created);
            const end = new Date(item.resolutiondate);
            cycleSeconds = (end - start) / 1000;
        }

        return {
            key: item.key,
            summary: item.summary,
            status: item.status || '-',
            issuetype: item.issuetype || 'Unknown',
            priority: item.priority || 'None',
            severity: item.severity || 'None',
            board: item.board || 'No Board',
            project: item.project_key || 'Unknown',
            est: est,
            spent: spent,
            overtime: spent - est,
            cycleTime: cycleSeconds,
            description: item.description || '',
            comments: item.comments || []
        };
    });

    // Apply sorting
    tasks = sortTasks(tasks);

    // Update sort icons
    updateTaskSortIcons();

    // Render table
    tasksTableBody.innerHTML = tasks.map(t => {
        const overtimeClass = t.overtime > 0 ? 'overtime-positive' : 'overtime-ok';
        const overtimeText = t.overtime > 0 ? `+${formatTime(t.overtime)}` : formatTime(t.overtime);
        
        // Cycle time with color coding
        let cycleText = '-';
        let cycleClass = '';
        if (t.cycleTime > 0) {
            const cycleDays = t.cycleTime / (3600 * 24);
            cycleText = `${cycleDays.toFixed(1)} дн.`;
            
            if (cycleDays <= 3) {
                cycleClass = 'cycle-good';
            } else if (cycleDays <= 5) {
                cycleClass = 'cycle-warn';
            } else {
                cycleClass = 'cycle-bad';
            }
        }
        
        return `
            <tr>
                <td style="max-width: 300px; white-space: normal;">${t.summary}</td>
                <td><a href="https://jira.surf.dev/browse/${t.key}" target="_blank" class="task-link">${t.key}</a></td>
                <td>${t.project}</td>
                <td>${t.issuetype}</td>
                <td>${t.priority}</td>
                <td>${formatTime(t.est)}</td>
                <td>${formatTime(t.spent)}</td>
                <td class="${overtimeClass}">${overtimeText}</td>
                <td class="${cycleClass}">${cycleText}</td>
                <td><button class="btn-detail" onclick="openTaskDetail('${escapeHtml(t.key)}')">Детали</button></td>
            </tr>
        `;
    }).join('');
}

function sortTasks(tasks) {
    return tasks.sort((a, b) => {
        let valA = a[taskSort.field];
        let valB = b[taskSort.field];

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return taskSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return taskSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
}

function sortTasksBy(field) {
    if (taskSort.field === field) {
        taskSort.direction = taskSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        taskSort.field = field;
        // Default direction based on field type
        if (field === 'summary' || field === 'key' || field === 'project' || field === 'issuetype' || field === 'priority') {
            taskSort.direction = 'asc';
        } else {
            taskSort.direction = 'desc';
        }
    }
    renderTaskList();
}
window.sortTasksBy = sortTasksBy;

function updateTaskSortIcons() {
    document.querySelectorAll('[id^="task-icon-"]').forEach(el => el.textContent = '');
    const iconId = `task-icon-${taskSort.field}`;
    const iconEl = document.getElementById(iconId);
    if (iconEl) {
        iconEl.textContent = taskSort.direction === 'asc' ? ' ▲' : ' ▼';
    }
}

function formatCycleDays(seconds) {
    const days = (seconds / (3600 * 24)).toFixed(1);
    return `${days} дн.`;
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function renderBugAnalysis() {
    // Filter only bugs and incidents
    const bugs = currentDetailData.filter(i => {
        const type = (i.issuetype || '').toLowerCase();
        return type === 'bug' || type === 'incident';
    });

    if (bugs.length === 0) {
        const grid = document.querySelector('.bug-analysis-grid');
        if (grid) grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#999">Багов и инцидентов не найдено в этой выборке</div>';
        return;
    } else {
        // Ensure grid exists (if we overwrote it previously)
        const container = document.getElementById('tab-bugs');
        if(!document.getElementById('bugPriorityChart')) {
            container.innerHTML = `
             <div class="bug-analysis-grid">
                    <div class="analysis-card">
                        <h4>Баги по Priority</h4>
                        <div class="chart-mini-wrapper">
                            <canvas id="bugPriorityChart"></canvas>
                        </div>
                        <div id="bugPriorityTable" class="mini-table"></div>
                    </div>
                    <div class="analysis-card">
                        <h4>Баги по Severity</h4>
                        <div class="chart-mini-wrapper">
                            <canvas id="bugSeverityChart"></canvas>
                        </div>
                        <div id="bugSeverityTable" class="mini-table"></div>
                    </div>
                </div>
            `;
        }
    }

    // Aggregate Priority - use for loop
    const priorityData = {};
    for (let i = 0; i < bugs.length; i++) {
        const p = bugs[i].priority || 'None';
        if (!priorityData[p]) priorityData[p] = 0;
        priorityData[p]++;
    }

    // Aggregate Severity - use for loop
    const severityData = {};
    for (let i = 0; i < bugs.length; i++) {
        const s = bugs[i].severity || 'None';
        if (!severityData[s]) severityData[s] = 0;
        severityData[s]++;
    }

    // Render Charts & Tables
    renderPieChart('bugPriorityChart', priorityData, ['#e74c3c', '#f39c12', '#3498db', '#95a5a6', '#2ecc71']);
    renderPieChart('bugSeverityChart', severityData, ['#c0392b', '#d35400', '#f1c40f', '#2980b9', '#7f8c8d']);

    renderMiniTable('bugPriorityTable', priorityData, 'Priority');
    renderMiniTable('bugSeverityTable', severityData, 'Severity');
}

function renderPieChart(canvasId, dataObj, colors) {
    const labels = Object.keys(dataObj);
    const data = Object.values(dataObj);
    
    updateChart(canvasId, 'doughnut', {
        labels: labels,
        datasets: [{
            data: data,
            backgroundColor: colors.slice(0, labels.length),
            borderWidth: 0
        }]
    }, {
        cutout: '60%',
        plugins: {
            legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } }
        }
    });
}

function renderMiniTable(containerId, dataObj, headerName) {
    const container = document.getElementById(containerId);
    const sortedKeys = Object.keys(dataObj).sort((a,b) => dataObj[b] - dataObj[a]);
    
    let html = `<table><thead><tr><th>${headerName}</th><th>Count</th></tr></thead><tbody>`;
    sortedKeys.forEach(k => {
        html += `<tr><td>${k}</td><td><strong>${dataObj[k]}</strong></td></tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

function drillDownToAssignees() {
    closeDetails();
    
    // Filter to only this project
    selectedProjects = [currentDetailName];
    
    // Update checkboxes
    const projects = getUniqueValues('project_key', 'Unknown');
    projects.forEach(p => {
        const checkbox = document.getElementById(`project-${escapeId(p)}`);
        if (checkbox) checkbox.checked = p === currentDetailName;
    });
    
    currentGrouping = 'assignee';
    document.querySelector('input[name="viewMode"][value="assignee"]').checked = true;
    updateFilterSummary();
    updateDashboard();
}
window.drillDownToAssignees = drillDownToAssignees;

// --- Task Detail Modal (Description & Comments) ---
function openTaskDetail(taskKey) {
    const task = currentDetailData.find(t => t.key === taskKey);
    if (!task) return;

    const modal = document.getElementById('taskDetailModal');
    const title = document.getElementById('taskDetailTitle');
    const descEl = document.getElementById('taskDescription');
    const commentsEl = document.getElementById('taskComments');
    const commentCount = document.getElementById('commentCount');

    // Set title
    title.innerHTML = `<a href="https://jira.surf.dev/browse/${taskKey}" target="_blank" class="task-link">${taskKey}</a>: ${task.summary}`;

    // Set description
    descEl.textContent = task.description || '';

    // Set comments
    const comments = task.comments || [];
    commentCount.textContent = comments.length;

    if (comments.length === 0) {
        commentsEl.innerHTML = '';
    } else {
        commentsEl.innerHTML = comments.map(comment => {
            const author = comment.author || 'Unknown';
            const body = comment.body || '';
            const created = comment.created ? new Date(comment.created).toLocaleString('ru-RU') : '';

            return `
                <div class="comment-item">
                    <div class="comment-header">
                        <span class="comment-author">${author}</span>
                        <span class="comment-date">${created}</span>
                    </div>
                    <div class="comment-body">${body}</div>
                </div>
            `;
        }).join('');
    }

    modal.style.display = 'block';
}
window.openTaskDetail = openTaskDetail;

function closeTaskDetail() {
    document.getElementById('taskDetailModal').style.display = 'none';
}
window.closeTaskDetail = closeTaskDetail;

function formatTime(seconds) {
    if (!seconds && seconds !== 0) return '-';
    const abs = Math.abs(seconds);
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const sign = seconds < 0 ? '-' : '';
    return `${sign}${h}h ${m}m`;
}

// --- Excel Export Functions ---
function exportMetricsToExcel() {
    try {
        // Check if XLSX is loaded
        if (typeof XLSX === 'undefined') {
            alert('Библиотека экспорта не загружена. Пожалуйста, перезагрузите страницу.');
            return;
        }
        
        const filteredData = filterData();
        const metrics = sortMetrics(calculateMetrics(filteredData, currentGrouping));
        
        if (metrics.length === 0) {
            alert('Нет данных для экспорта');
            return;
        }
        
        // Determine group name label
        let groupLabel = 'Проект';
        if (currentGrouping === 'assignee') groupLabel = 'Исполнитель';
        else if (currentGrouping === 'board') groupLabel = 'Направление';
        else if (currentGrouping === 'month') groupLabel = 'Месяц';
        else if (currentGrouping === 'sprint') groupLabel = 'Спринт';
        else if (currentGrouping === 'epic') groupLabel = 'Эпик';
        
        // Prepare data for export
        const exportData = metrics.map(m => ({
            [groupLabel]: m.name,
            'Ср. время выполнения (дни)': m.avgCycleDays,
            'Производительность (%)': m.performance,
            'Процент отладки (%)': m.debugRatio,
            'Процент коммуникаций (%)': m.commRatio,
            'Кол-во CR': m.crCount
        }));
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        
        // Set column widths
        ws['!cols'] = [
            { wch: 30 },  // Name
            { wch: 25 },  // Cycle time
            { wch: 20 },  // Performance
            { wch: 20 },  // Debug
            { wch: 25 },  // Comm
            { wch: 12 }   // CR
        ];
        
        XLSX.utils.book_append_sheet(wb, ws, 'Метрики');
        
        // Generate filename
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `jira_metrics_${currentGrouping}_${timestamp}.xlsx`;
        
        // Download
        XLSX.writeFile(wb, filename);
        
        console.log('✓ Excel file exported successfully:', filename);
    } catch (error) {
        console.error('❌ Error exporting to Excel:', error);
        alert('Ошибка при экспорте: ' + error.message);
    }
}
window.exportMetricsToExcel = exportMetricsToExcel;

// Alias for main export button in header
function exportMainTableToExcel() {
    exportMetricsToExcel();
}
window.exportMainTableToExcel = exportMainTableToExcel;

function exportTasksToExcel() {
    try {
        // Check if XLSX is loaded
        if (typeof XLSX === 'undefined') {
            alert('Библиотека экспорта не загружена. Пожалуйста, перезагрузите страницу.');
            return;
        }
        
        if (!currentDetailData || currentDetailData.length === 0) {
            alert('Нет данных для экспорта');
            return;
        }
        
    // Apply current filters and get tasks
    let filteredTasks = currentDetailData.filter(item => {
        const matchType = taskFilters.type === 'all' || (item.issuetype || 'Unknown') === taskFilters.type;
        const matchPriority = taskFilters.priority === 'all' || (item.priority || 'None') === taskFilters.priority;
        const matchSeverity = taskFilters.severity === 'all' || (item.severity || 'None') === taskFilters.severity;
        const matchBoard = taskFilters.board === 'all' || (item.board || 'No Board') === taskFilters.board;
        
        let matchSearch = true;
        if (taskSearchQuery) {
            const query = taskSearchQuery.toLowerCase();
            const searchableText = [
                item.summary || '',
                item.key || '',
                item.issuetype || '',
                item.priority || '',
                item.severity || '',
                item.board || '',
                item.assignee || '',
                item.description || ''
            ].join(' ').toLowerCase();
            matchSearch = searchableText.includes(query);
        }
        
        return matchType && matchPriority && matchSeverity && matchBoard && matchSearch;
    });
    
    // Prepare data
    const exportData = filteredTasks.map(item => {
        const spent = parseInt(item.timespent || 0, 10);
        const est = parseInt(item.timeoriginalestimate || 0, 10);
        
        let cycleSeconds = 0;
        if (item.task_cycle_seconds && item.task_cycle_seconds > 0) {
            cycleSeconds = item.task_cycle_seconds;
        } else if (item.resolutiondate && item.created) {
            const start = new Date(item.created);
            const end = new Date(item.resolutiondate);
            cycleSeconds = (end - start) / 1000;
        }
        
        const cycleDays = cycleSeconds > 0 ? (cycleSeconds / (3600 * 24)).toFixed(1) : '-';
        
        return {
            'Ключ': item.key,
            'Задача': item.summary,
            'Тип': item.issuetype || 'Unknown',
            'Приоритет': item.priority || 'None',
            'Severity': item.severity || 'None',
            'Board': item.board || 'No Board',
            'Исполнитель': item.assignee || 'Не назначен',
            'Оценка (ч)': (est / 3600).toFixed(1),
            'Затрачено (ч)': (spent / 3600).toFixed(1),
            'Перетрек (ч)': ((spent - est) / 3600).toFixed(1),
            'Время жизни (дни)': cycleDays,
            'Создано': item.created || '',
            'Завершено': item.resolutiondate || '',
            'Ссылка': `https://jira.surf.dev/browse/${item.key}`
        };
    });
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    ws['!cols'] = [
        { wch: 15 },  // Key
        { wch: 60 },  // Summary
        { wch: 12 },  // Type
        { wch: 12 },  // Priority
        { wch: 12 },  // Severity
        { wch: 12 },  // Board
        { wch: 20 },  // Assignee
        { wch: 12 },  // Est
        { wch: 12 },  // Spent
        { wch: 12 },  // Overtime
        { wch: 15 },  // Cycle
        { wch: 20 },  // Created
        { wch: 20 },  // Resolved
        { wch: 40 }   // Link
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Задачи');
    
    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `jira_tasks_${currentDetailName}_${timestamp}.xlsx`;
    
    // Download
    XLSX.writeFile(wb, filename);
    
    console.log('✓ Tasks exported successfully:', filename);
    } catch (error) {
        console.error('❌ Error exporting tasks to Excel:', error);
        alert('Ошибка при экспорте задач: ' + error.message);
    }
}
window.exportTasksToExcel = exportTasksToExcel;

// --- KPI Details Modal ---
function openKPIDetails(kpiType) {
    const modal = document.getElementById('kpiModal');
    const title = document.getElementById('kpiModalTitle');
    const content = document.getElementById('kpiModalContent');
    
    const filteredData = filterData();
    
    if (kpiType === 'cr') {
        // Show CR tasks
        title.textContent = 'Детали: Change Requests';
        const crTasks = filteredData.filter(item => isCR(item));
        renderKPITasksList(content, crTasks, 'CR задачи');
    } else if (kpiType === 'performance') {
        // Show performance by assignee
        title.textContent = 'Детали: Производительность по исполнителям';
        const metrics = calculateMetrics(filteredData, 'assignee');
        renderKPIMetricsList(content, metrics, 'performance', 'Производительность', '%');
    } else if (kpiType === 'cycle') {
        // Show cycle time by assignee
        title.textContent = 'Детали: Среднее время выполнения по исполнителям';
        const metrics = calculateMetrics(filteredData, 'assignee');
        renderKPIMetricsList(content, metrics, 'cycle', 'Ср. время', ' дн.');
    } else if (kpiType === 'debug') {
        // Show debug ratio by assignee
        title.textContent = 'Детали: Процент отладки по исполнителям';
        const metrics = calculateMetrics(filteredData, 'assignee');
        renderKPIMetricsList(content, metrics, 'debug', 'Отладка', '%');
    } else if (kpiType === 'comm') {
        // Show comm ratio by assignee
        title.textContent = 'Детали: Процент коммуникаций по исполнителям';
        const metrics = calculateMetrics(filteredData, 'assignee');
        renderKPIMetricsList(content, metrics, 'comm', 'Коммуникации', '%');
    }
    
    modal.style.display = 'block';
}
window.openKPIDetails = openKPIDetails;

function closeKPIModal() {
    document.getElementById('kpiModal').style.display = 'none';
}
window.closeKPIModal = closeKPIModal;

function renderKPIMetricsList(container, metrics, metricType, metricLabel, suffix) {
    // Store data for search/sort
    window.currentKPIData = {
        metrics: metrics,
        metricType: metricType,
        metricLabel: metricLabel,
        suffix: suffix,
        sortDirection: 'desc',
        sortBy: 'value',
        filteredData: filterData() // Store filtered data for task lookup
    };
    
    let html = `
        <div style="margin-bottom: 15px;">
            <input type="text" id="kpiSearchInput" class="filter-search-input" placeholder="🔍 Поиск по имени..." style="width: 100%;" oninput="searchKPIList()">
        </div>
        <div class="table-container" style="box-shadow: none; padding: 0;">
            <table class="details-table" id="kpiMetricsTable">
                <thead>
                    <tr>
                        <th style="width: 30px;"></th>
                        <th class="sortable-task" onclick="sortKPIList('name')" style="cursor: pointer;">
                            Исполнитель <span id="kpi-icon-name" class="sort-icon"></span>
                        </th>
                        <th class="sortable-task" onclick="sortKPIList('value')" style="cursor: pointer;">
                            ${metricLabel} <span id="kpi-icon-value" class="sort-icon"></span>
                        </th>
                        <th>Задач</th>
                    </tr>
                </thead>
                <tbody id="kpiTableBody">
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
    
    // Initial render and sort icons
    const currentIcon = document.getElementById(`kpi-icon-${window.currentKPIData.sortBy}`);
    if (currentIcon) {
        currentIcon.textContent = window.currentKPIData.sortDirection === 'asc' ? ' ▲' : ' ▼';
    }
    updateKPITableBody();
}

function updateKPITableBody() {
    const tbody = document.getElementById('kpiTableBody');
    if (!tbody || !window.currentKPIData) return;
    
    const { metrics, metricType, suffix, sortBy, sortDirection } = window.currentKPIData;
    const searchTerm = document.getElementById('kpiSearchInput')?.value.toLowerCase() || '';
    
    // Filter by search
    let filteredMetrics = metrics.filter(m => 
        m.name.toLowerCase().includes(searchTerm)
    );
    
    // Sort
    filteredMetrics.sort((a, b) => {
        let valA, valB;
        
        if (sortBy === 'name') {
            valA = a.name.toLowerCase();
            valB = b.name.toLowerCase();
            if (sortDirection === 'asc') {
                return valA < valB ? -1 : valA > valB ? 1 : 0;
            } else {
                return valA > valB ? -1 : valA < valB ? 1 : 0;
            }
        } else { // sortBy === 'value'
            if (metricType === 'performance') {
                valA = parseFloat(a.performance);
                valB = parseFloat(b.performance);
            } else if (metricType === 'cycle') {
                valA = parseFloat(a.avgCycleDays);
                valB = parseFloat(b.avgCycleDays);
            } else if (metricType === 'debug') {
                valA = parseFloat(a.debugRatio);
                valB = parseFloat(b.debugRatio);
            } else if (metricType === 'comm') {
                valA = parseFloat(a.commRatio);
                valB = parseFloat(b.commRatio);
            }
            
            if (sortDirection === 'asc') {
                return valA - valB;
            } else {
                return valB - valA;
            }
        }
    });
    
    // Render rows
    tbody.innerHTML = filteredMetrics.map((m, index) => {
        let value = '';
        let cssClass = '';
        
        if (metricType === 'performance') {
            value = m.performance;
            const pVal = parseFloat(m.performance);
            if (pVal >= 100) cssClass = 'badge-good';
            else if (pVal >= 80) cssClass = 'badge-warn';
            else cssClass = 'badge-bad';
        } else if (metricType === 'cycle') {
            value = m.avgCycleDays;
        } else if (metricType === 'debug') {
            value = m.debugRatio;
        } else if (metricType === 'comm') {
            value = m.commRatio;
        }
        
        // Get tasks for this assignee
        const assigneeTasks = window.currentKPIData.filteredData.filter(task => 
            (task.assignee || 'Не назначен') === m.name
        );
        
        return `
            <tr class="kpi-main-row" onclick="toggleKPITasks('kpi-tasks-${index}')" style="cursor: pointer;">
                <td style="text-align: center;">
                    <span id="kpi-icon-${index}" class="expand-icon">▶</span>
                </td>
                <td style="font-weight: 600;">${m.name}</td>
                <td><span class="badge ${cssClass}">${value}${suffix}</span></td>
                <td>${assigneeTasks.length}</td>
            </tr>
            <tr id="kpi-tasks-${index}" class="kpi-tasks-row" style="display: none;">
                <td colspan="4">
                    ${renderAssigneeTasks(assigneeTasks, metricType)}
                </td>
            </tr>
        `;
    }).join('');
}

function renderAssigneeTasks(tasks, metricType) {
    if (tasks.length === 0) {
        return '<div style="padding: 15px; color: #999;">Нет задач</div>';
    }
    
    let html = `
        <div style="padding: 10px; background: #f8f9fa; border-left: 3px solid var(--accent-color);">
            <table class="details-table" style="margin: 0;">
                <thead>
                    <tr>
                        <th>Задача</th>
                        <th>Тип</th>
                        <th>Статус</th>
    `;
    
    // Add metric-specific column
    if (metricType === 'performance') {
        html += '<th>Производ-ть</th>';
    } else if (metricType === 'cycle') {
        html += '<th>Цикл (дн)</th>';
    } else if (metricType === 'debug') {
        html += '<th>Отладка</th>';
    } else if (metricType === 'comm') {
        html += '<th>Коммуникации</th>';
    }
    
    html += `
                    </tr>
                </thead>
                <tbody>
    `;
    
    tasks.forEach(task => {
        const key = task.key || '-';
        const summary = task.summary || 'Без названия';
        const type = task.issuetype || '-';
        const status = task.status || '-';
        const jiraUrl = `https://jira.surf.dev/browse/${key}`;
        
        let metricValue = '';
        if (metricType === 'performance') {
            const spent = parseInt(task.timespent || 0);
            const est = parseInt(task.timeoriginalestimate || 0);
            const perf = spent > 0 ? ((est / spent) * 100).toFixed(1) : '0';
            metricValue = `${perf}%`;
        } else if (metricType === 'cycle') {
            if (task.task_cycle_seconds && task.task_cycle_seconds > 0) {
                const days = (task.task_cycle_seconds / (3600 * 24)).toFixed(1);
                metricValue = `${days} дн.`;
            } else if (task.resolutiondate && task.created) {
                const start = new Date(task.created);
                const end = new Date(task.resolutiondate);
                const days = ((end - start) / (1000 * 3600 * 24)).toFixed(1);
                metricValue = `${days} дн.`;
            } else {
                metricValue = '-';
            }
        } else if (metricType === 'debug') {
            const taskType = (task.issuetype || '').toLowerCase();
            metricValue = (taskType === 'bug' || taskType === 'incident') ? '🐛 Баг' : '-';
        } else if (metricType === 'comm') {
            const taskType = (task.issuetype || '').toLowerCase();
            metricValue = taskType.includes('service') ? '💬 Сервис' : '-';
        }
        
        html += `
                    <tr>
                        <td>
                            <a href="${jiraUrl}" target="_blank" style="color: var(--accent-color); text-decoration: none;">
                                ${key}
                            </a>
                            <div style="color: #666; font-size: 12px; margin-top: 2px;">${summary.substring(0, 60)}${summary.length > 60 ? '...' : ''}</div>
                        </td>
                        <td>${type}</td>
                        <td>${status}</td>
                        <td>${metricValue}</td>
                    </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    return html;
}

function toggleKPITasks(rowId) {
    const row = document.getElementById(rowId);
    const iconId = rowId.replace('kpi-tasks-', 'kpi-icon-');
    const icon = document.getElementById(iconId);
    
    if (row.style.display === 'none') {
        row.style.display = 'table-row';
        if (icon) icon.textContent = '▼';
    } else {
        row.style.display = 'none';
        if (icon) icon.textContent = '▶';
    }
}
window.toggleKPITasks = toggleKPITasks;

function searchKPIList() {
    updateKPITableBody();
}
window.searchKPIList = searchKPIList;

function sortKPIList(sortBy) {
    if (!window.currentKPIData) return;
    
    if (window.currentKPIData.sortBy === sortBy) {
        // Toggle direction
        window.currentKPIData.sortDirection = 
            window.currentKPIData.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // New sort column
        window.currentKPIData.sortBy = sortBy;
        window.currentKPIData.sortDirection = sortBy === 'name' ? 'asc' : 'desc';
    }
    
    // Update sort icons
    const nameIcon = document.getElementById('kpi-icon-name');
    const valueIcon = document.getElementById('kpi-icon-value');
    if (nameIcon) nameIcon.textContent = '';
    if (valueIcon) valueIcon.textContent = '';
    
    const currentIcon = document.getElementById(`kpi-icon-${sortBy}`);
    if (currentIcon) {
        currentIcon.textContent = window.currentKPIData.sortDirection === 'asc' ? ' ▲' : ' ▼';
    }
    
    updateKPITableBody();
}
window.sortKPIList = sortKPIList;

function renderKPITasksList(container, tasks, title) {
    // Store data for search/sort
    window.currentKPITasksData = {
        tasks: tasks,
        title: title,
        sortDirection: 'asc',
        sortBy: 'key'
    };
    
    let html = `
        <div style="margin-bottom: 15px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <h4 style="margin: 0;">${title} (<span id="kpiTasksCount">${tasks.length}</span> задач)</h4>
            <input type="text" id="kpiTasksSearchInput" class="filter-search-input" placeholder="🔍 Поиск..." style="flex: 1; min-width: 200px;" oninput="searchKPITasks()">
        </div>
        <div class="table-container" style="box-shadow: none; padding: 0;">
            <table class="details-table">
                <thead>
                    <tr>
                        <th class="sortable-task" onclick="sortKPITasks('key')" style="cursor: pointer;">
                            Ключ <span id="kpi-task-icon-key" class="sort-icon"></span>
                        </th>
                        <th class="sortable-task" onclick="sortKPITasks('summary')" style="cursor: pointer;">
                            Задача <span id="kpi-task-icon-summary" class="sort-icon"></span>
                        </th>
                        <th class="sortable-task" onclick="sortKPITasks('assignee')" style="cursor: pointer;">
                            Исполнитель <span id="kpi-task-icon-assignee" class="sort-icon"></span>
                        </th>
                        <th class="sortable-task" onclick="sortKPITasks('project')" style="cursor: pointer;">
                            Проект <span id="kpi-task-icon-project" class="sort-icon"></span>
                        </th>
                        <th class="sortable-task" onclick="sortKPITasks('type')" style="cursor: pointer;">
                            Тип <span id="kpi-task-icon-type" class="sort-icon"></span>
                        </th>
                        <th class="sortable-task" onclick="sortKPITasks('estimate')" style="cursor: pointer;">
                            Оценка <span id="kpi-task-icon-estimate" class="sort-icon"></span>
                        </th>
                        <th class="sortable-task" onclick="sortKPITasks('spent')" style="cursor: pointer;">
                            Затрачено <span id="kpi-task-icon-spent" class="sort-icon"></span>
                        </th>
                    </tr>
                </thead>
                <tbody id="kpiTasksTableBody">
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
    
    // Initial render and sort icons
    const currentIcon = document.getElementById(`kpi-task-icon-${window.currentKPITasksData.sortBy}`);
    if (currentIcon) {
        currentIcon.textContent = window.currentKPITasksData.sortDirection === 'asc' ? ' ▲' : ' ▼';
    }
    updateKPITasksTableBody();
}

function updateKPITasksTableBody() {
    const tbody = document.getElementById('kpiTasksTableBody');
    const countSpan = document.getElementById('kpiTasksCount');
    if (!tbody || !window.currentKPITasksData) return;
    
    const { tasks, sortBy, sortDirection } = window.currentKPITasksData;
    const searchTerm = document.getElementById('kpiTasksSearchInput')?.value.toLowerCase() || '';
    
    // Filter by search
    let filteredTasks = tasks.filter(task => 
        (task.key || '').toLowerCase().includes(searchTerm) ||
        (task.summary || '').toLowerCase().includes(searchTerm) ||
        (task.assignee || '').toLowerCase().includes(searchTerm) ||
        (task.project_key || '').toLowerCase().includes(searchTerm) ||
        (task.issuetype || '').toLowerCase().includes(searchTerm)
    );
    
    // Sort
    filteredTasks.sort((a, b) => {
        let valA, valB;
        
        switch(sortBy) {
            case 'key':
                valA = a.key || '';
                valB = b.key || '';
                break;
            case 'summary':
                valA = (a.summary || '').toLowerCase();
                valB = (b.summary || '').toLowerCase();
                break;
            case 'assignee':
                valA = (a.assignee || '').toLowerCase();
                valB = (b.assignee || '').toLowerCase();
                break;
            case 'project':
                valA = (a.project_key || '').toLowerCase();
                valB = (b.project_key || '').toLowerCase();
                break;
            case 'type':
                valA = (a.issuetype || '').toLowerCase();
                valB = (b.issuetype || '').toLowerCase();
                break;
            case 'estimate':
                valA = parseInt(a.timeoriginalestimate || 0, 10);
                valB = parseInt(b.timeoriginalestimate || 0, 10);
                break;
            case 'spent':
                valA = parseInt(a.timespent || 0, 10);
                valB = parseInt(b.timespent || 0, 10);
                break;
            default:
                valA = a.key || '';
                valB = b.key || '';
        }
        
        if (typeof valA === 'string') {
            if (sortDirection === 'asc') {
                return valA < valB ? -1 : valA > valB ? 1 : 0;
            } else {
                return valA > valB ? -1 : valA < valB ? 1 : 0;
            }
        } else {
            if (sortDirection === 'asc') {
                return valA - valB;
            } else {
                return valB - valA;
            }
        }
    });
    
    // Update count
    if (countSpan) countSpan.textContent = filteredTasks.length;
    
    // Render rows
    tbody.innerHTML = filteredTasks.map(task => {
        const spent = parseInt(task.timespent || 0, 10);
        const est = parseInt(task.timeoriginalestimate || 0, 10);
        
        return `
            <tr>
                <td><a href="https://jira.surf.dev/browse/${task.key}" target="_blank" class="task-link">${task.key}</a></td>
                <td style="max-width: 400px; white-space: normal;">${task.summary}</td>
                <td>${task.assignee || 'Не назначен'}</td>
                <td>${task.project_key || 'Unknown'}</td>
                <td>${task.issuetype || 'Unknown'}</td>
                <td>${formatTime(est)}</td>
                <td>${formatTime(spent)}</td>
            </tr>
        `;
    }).join('');
}

function searchKPITasks() {
    updateKPITasksTableBody();
}
window.searchKPITasks = searchKPITasks;

function sortKPITasks(sortBy) {
    if (!window.currentKPITasksData) return;
    
    if (window.currentKPITasksData.sortBy === sortBy) {
        // Toggle direction
        window.currentKPITasksData.sortDirection = 
            window.currentKPITasksData.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // New sort column
        window.currentKPITasksData.sortBy = sortBy;
        window.currentKPITasksData.sortDirection = 'asc';
    }
    
    // Update sort icons
    const fields = ['key', 'summary', 'assignee', 'project', 'type', 'estimate', 'spent'];
    for (let i = 0; i < fields.length; i++) {
        const icon = document.getElementById(`kpi-task-icon-${fields[i]}`);
        if (icon) icon.textContent = '';
    }
    
    const currentIcon = document.getElementById(`kpi-task-icon-${sortBy}`);
    if (currentIcon) {
        currentIcon.textContent = window.currentKPITasksData.sortDirection === 'asc' ? ' ▲' : ' ▼';
    }
    
    updateKPITasksTableBody();
}
window.sortKPITasks = sortKPITasks;

// ===== DATE FILTER LOGIC =====
let dateFilter = {
    enabled: false,
    from: null,
    to: null,
    compareEnabled: false,
    compareFrom: null,
    compareTo: null
};

function openDateFilterModal() {
    const modal = document.getElementById('dateFilterModal');
    if (modal) {
        modal.style.display = 'block';
        updateDateFilterDisplay();
    }
}

function closeDateFilter() {
    const modal = document.getElementById('dateFilterModal');
    if (modal) modal.style.display = 'none';
}

function toggleComparison() {
    const checkbox = document.getElementById('comparePeriodsCheckbox');
    const comparisonDiv = document.getElementById('comparisonDates');
    
    if (checkbox.checked) {
        comparisonDiv.style.display = 'block';
        // Auto-calculate previous period
        autoCalculatePreviousPeriod();
    } else {
        comparisonDiv.style.display = 'none';
    }
}

function autoCalculatePreviousPeriod() {
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    
    if (!dateFrom || !dateTo) return;
    
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const duration = to - from;
    
    const compareFrom = new Date(from.getTime() - duration);
    const compareTo = new Date(from.getTime() - 86400000); // -1 day
    
    document.getElementById('compareDateFrom').value = compareFrom.toISOString().split('T')[0];
    document.getElementById('compareDateTo').value = compareTo.toISOString().split('T')[0];
}

function applyDatePreset(preset) {
    const now = new Date();
    let from, to;
    
    switch(preset) {
        case 'lastMonth':
            // Последний месяц = 30 дней назад от текущей даты
            to = new Date();
            from = new Date();
            from.setDate(from.getDate() - 30);
            break;
        case 'lastQuarter':
            // Последний квартал = 90 дней назад от текущей даты
            to = new Date();
            from = new Date();
            from.setDate(from.getDate() - 90);
            break;
        case 'thisYear':
            // Этот год = с начала года до текущей даты
            from = new Date(now.getFullYear(), 0, 1);
            to = new Date();
            break;
        case 'last3Months':
            // Последние 3 месяца = 90 дней назад от текущей даты
            to = new Date();
            from = new Date();
            from.setDate(from.getDate() - 90);
            break;
        case 'last6Months':
            // Последние 6 месяцев = 180 дней назад от текущей даты
            to = new Date();
            from = new Date();
            from.setDate(from.getDate() - 180);
            break;
        case 'all':
            document.getElementById('dateFrom').value = '';
            document.getElementById('dateTo').value = '';
            updateDateFilterDisplay();
            return;
    }
    
    document.getElementById('dateFrom').value = from.toISOString().split('T')[0];
    document.getElementById('dateTo').value = to.toISOString().split('T')[0];
    
    updateDateFilterDisplay();
}

function updateDateFilterDisplay() {
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const infoDiv = document.getElementById('dateFilterInfo');
    const textSpan = document.getElementById('currentPeriodText');
    
    if (dateFrom || dateTo) {
        infoDiv.style.display = 'block';
        const fromText = dateFrom ? new Date(dateFrom).toLocaleDateString('ru-RU') : '∞';
        const toText = dateTo ? new Date(dateTo).toLocaleDateString('ru-RU') : '∞';
        textSpan.textContent = `${fromText} — ${toText}`;
    } else {
        infoDiv.style.display = 'none';
    }
}

function applyDateFilter() {
    console.log('📅 applyDateFilter called');
    console.log('📅 Current tab:', window.currentMainTab || 'unknown');
    
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const compareCheckbox = document.getElementById('comparePeriodsCheckbox').checked;
    const compareDateFrom = document.getElementById('compareDateFrom').value;
    const compareDateTo = document.getElementById('compareDateTo').value;
    
    if (dateFrom || dateTo) {
        dateFilter.enabled = true;
        dateFilter.from = dateFrom ? new Date(dateFrom) : null;
        dateFilter.to = dateTo ? new Date(dateTo) : null;
        
        console.log('📅 Date filter enabled:', {
            from: dateFilter.from?.toLocaleDateString('ru-RU'),
            to: dateFilter.to?.toLocaleDateString('ru-RU')
        });
        
        if (compareCheckbox && compareDateFrom && compareDateTo) {
            dateFilter.compareEnabled = true;
            dateFilter.compareFrom = new Date(compareDateFrom);
            dateFilter.compareTo = new Date(compareDateTo);
        } else {
            dateFilter.compareEnabled = false;
        }
    } else {
        dateFilter.enabled = false;
        dateFilter.compareEnabled = false;
    }
    
    closeDateFilter();
    updateDashboard();
    
    // Update trends if on trends tab
    if (typeof currentMainTab !== 'undefined' && currentMainTab === 'trends') {
        console.log('📅 Detected trends tab - calling renderTrends()');
        if (typeof renderTrends === 'function') {
            renderTrends();
        } else {
            console.warn('📅 renderTrends function not available');
        }
    } else {
        console.log('📅 Not on trends tab, skipping renderTrends()');
    }
    
    // Update filter tags
    updateDateFilterTag();
}

function resetDateFilter() {
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    document.getElementById('compareDateFrom').value = '';
    document.getElementById('compareDateTo').value = '';
    document.getElementById('comparePeriodsCheckbox').checked = false;
    document.getElementById('comparisonDates').style.display = 'none';
    
    dateFilter.enabled = false;
    dateFilter.compareEnabled = false;
    
    closeDateFilter();
    updateDashboard();
    
    // Update trends if on trends tab
    if (typeof currentMainTab !== 'undefined' && currentMainTab === 'trends') {
        if (typeof renderTrends === 'function') {
            renderTrends();
        }
    }
    
    updateDateFilterTag();
}

function updateDateFilterTag() {
    const container = document.getElementById('filterTagsContainer');
    if (!container) return;
    
    // Remove existing date filter tag
    const existingTag = container.querySelector('.date-filter-tag');
    if (existingTag) existingTag.remove();
    
    if (dateFilter.enabled) {
        const fromText = dateFilter.from ? dateFilter.from.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '∞';
        const toText = dateFilter.to ? dateFilter.to.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '∞';
        
        const tag = document.createElement('span');
        tag.className = 'filter-tag date-filter-tag';
        tag.onclick = openDateFilterModal;
        tag.innerHTML = `
            <span class="filter-tag-icon">📅</span>
            <span>${fromText} — ${toText}</span>
        `;
        
        container.insertBefore(tag, container.firstChild);
    }
}

// Hook into filterData function - use IIFE to avoid recursion
(function() {
    const originalFilterData = filterData;
    
    filterData = function() {
        let filtered = originalFilterData();
        console.log(`🔍 filterData: After original filter: ${filtered.length} items`);
        
        if (dateFilter.enabled) {
            console.log(`📅 Date filter enabled: from ${dateFilter.from?.toLocaleDateString('ru-RU')} to ${dateFilter.to?.toLocaleDateString('ru-RU')}`);
            
            // Use for loop instead of filter() to prevent stack overflow
            const dateFiltered = [];
            const toDateEnd = dateFilter.to ? new Date(dateFilter.to.getTime() + 86400000) : null;
            
            for (let i = 0; i < filtered.length; i++) {
                const item = filtered[i];
                const resolvedDate = item.resolutiondate ? new Date(item.resolutiondate) : null;
                const createdDate = new Date(item.created);
                
                // Use resolution date if available, otherwise created date
                const itemDate = resolvedDate || createdDate;
                
                if (dateFilter.from && itemDate < dateFilter.from) continue;
                if (toDateEnd && itemDate > toDateEnd) continue; // Include end date
                
                dateFiltered.push(item);
            }
            
            console.log(`📅 After date filter: ${dateFiltered.length} items`);
            return dateFiltered;
        }
        
        console.log(`🔍 No date filter, returning ${filtered.length} items`);
        return filtered;
    };
    
    // Export to global scope
    window.filterData = filterData;
})();

// Event Listeners
document.getElementById('openDateFilterBtn')?.addEventListener('click', openDateFilterModal);
document.getElementById('dateFrom')?.addEventListener('change', updateDateFilterDisplay);
document.getElementById('dateTo')?.addEventListener('change', updateDateFilterDisplay);

// Close modal on outside click
window.addEventListener('click', (event) => {
    const modal = document.getElementById('dateFilterModal');
    if (event.target === modal) {
        closeDateFilter();
    }
});

// Export functions
window.openDateFilterModal = openDateFilterModal;
window.closeDateFilter = closeDateFilter;
window.toggleComparison = toggleComparison;
window.applyDatePreset = applyDatePreset;
window.applyDateFilter = applyDateFilter;
window.resetDateFilter = resetDateFilter;

// ===== TASK SIZE ANALYSIS =====
function analyzeSizeDistribution(data) {
    const sizeCategories = {
        small: { tasks: [], label: 'Маленькие', threshold: 4 * 3600 }, // < 4 hours
        medium: { tasks: [], label: 'Средние', threshold: 16 * 3600 }, // 4-16 hours
        large: { tasks: [], label: 'Большие', threshold: Infinity } // > 16 hours
    };
    
    // Группируем задачи по размеру (используем оценку) - use for loop
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const estimate = parseInt(item.timeoriginalestimate || 0, 10);
        const spent = parseInt(item.timespent || 0, 10);
        
        if (estimate > 0 && spent > 0 && item.resolutiondate) {
            if (estimate < sizeCategories.small.threshold) {
                sizeCategories.small.tasks.push(item);
            } else if (estimate < sizeCategories.medium.threshold) {
                sizeCategories.medium.tasks.push(item);
            } else {
                sizeCategories.large.tasks.push(item);
            }
        }
    }
    
    // Рассчитываем метрики для каждой категории
    const results = {};
    const keys = Object.keys(sizeCategories);
    
    for (let k = 0; k < keys.length; k++) {
        const key = keys[k];
        const category = sizeCategories[key];
        const tasks = category.tasks;
        
        if (tasks.length === 0) {
            results[key] = {
                count: 0,
                performance: 0,
                avgCycleDays: 0,
                label: category.label
            };
            return;
        }
        
        // Производительность
        let totalEst = 0;
        let totalSpent = 0;
        let totalCycleTime = 0;
        let cycleCount = 0;
        
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            const est = parseInt(task.timeoriginalestimate || 0, 10);
            const spent = parseInt(task.timespent || 0, 10);
            
            totalEst += est;
            totalSpent += spent;
            
            // Cycle time
            if (task.task_cycle_seconds && task.task_cycle_seconds > 0) {
                totalCycleTime += task.task_cycle_seconds;
                cycleCount++;
            } else if (task.resolutiondate && task.created) {
                const start = new Date(task.created);
                const end = new Date(task.resolutiondate);
                const cycleSeconds = (end - start) / 1000;
                if (cycleSeconds > 0) {
                    totalCycleTime += cycleSeconds;
                    cycleCount++;
                }
            }
        }
        
        const performance = totalSpent > 0 ? (totalEst / totalSpent) * 100 : 0;
        const avgCycleDays = cycleCount > 0 ? (totalCycleTime / cycleCount) / (3600 * 24) : 0;
        
        results[key] = {
            count: tasks.length,
            performance: performance.toFixed(1),
            avgCycleDays: avgCycleDays.toFixed(1),
            label: category.label
        };
    }
    
    return results;
}

function renderSizeAnalysis(data) {
    const analysis = analyzeSizeDistribution(data);
    
    // Обновляем карточки
    document.getElementById('smallTasksCount').textContent = analysis.small.count;
    document.getElementById('smallTasksPerf').textContent = `${analysis.small.performance}%`;
    document.getElementById('smallTasksCycle').textContent = `${analysis.small.avgCycleDays} дн.`;
    
    document.getElementById('mediumTasksCount').textContent = analysis.medium.count;
    document.getElementById('mediumTasksPerf').textContent = `${analysis.medium.performance}%`;
    document.getElementById('mediumTasksCycle').textContent = `${analysis.medium.avgCycleDays} дн.`;
    
    document.getElementById('largeTasksCount').textContent = analysis.large.count;
    document.getElementById('largeTasksPerf').textContent = `${analysis.large.performance}%`;
    document.getElementById('largeTasksCycle').textContent = `${analysis.large.avgCycleDays} дн.`;
    
    // Рендерим графики
    renderSizeDistributionChart(analysis);
    renderSizePerformanceChart(analysis);
}

function renderSizeDistributionChart(analysis) {
    const labels = ['Маленькие\n(< 4ч)', 'Средние\n(4-16ч)', 'Большие\n(> 16ч)'];
    const data = [analysis.small.count, analysis.medium.count, analysis.large.count];
    const colors = ['#2ecc71', '#f39c12', '#e74c3c'];
    
    updateChart('sizeDistributionChart', 'doughnut', {
        labels: labels,
        datasets: [{
            data: data,
            backgroundColor: colors,
            borderWidth: 2,
            borderColor: '#fff'
        }]
    }, {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: {
                position: 'bottom'
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.label || '';
                        const value = context.parsed || 0;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = ((value / total) * 100).toFixed(1);
                        return `${label}: ${value} задач (${percentage}%)`;
                    }
                }
            }
        }
    });
}

function renderSizePerformanceChart(analysis) {
    const labels = ['Маленькие', 'Средние', 'Большие'];
    const perfData = [
        parseFloat(analysis.small.performance),
        parseFloat(analysis.medium.performance),
        parseFloat(analysis.large.performance)
    ];
    const cycleData = [
        parseFloat(analysis.small.avgCycleDays),
        parseFloat(analysis.medium.avgCycleDays),
        parseFloat(analysis.large.avgCycleDays)
    ];
    
    updateChart('sizePerformanceChart', 'bar', {
        labels: labels,
        datasets: [
            {
                label: 'Производительность (%)',
                data: perfData,
                backgroundColor: 'rgba(52, 152, 219, 0.6)',
                borderColor: '#3498db',
                borderWidth: 2,
                yAxisID: 'y'
            },
            {
                label: 'Ср. время цикла (дни)',
                data: cycleData,
                backgroundColor: 'rgba(231, 76, 60, 0.6)',
                borderColor: '#e74c3c',
                borderWidth: 2,
                yAxisID: 'y1'
            }
        ]
    }, {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                title: {
                    display: true,
                    text: 'Производительность (%)'
                },
                ticks: {
                    callback: function(value) {
                        return value + '%';
                    }
                }
            },
            y1: {
                type: 'linear',
                display: true,
                position: 'right',
                title: {
                    display: true,
                    text: 'Время цикла (дни)'
                },
                grid: {
                    drawOnChartArea: false
                },
                ticks: {
                    callback: function(value) {
                        return value + ' дн';
                    }
                }
            }
        },
        plugins: {
            legend: {
                position: 'bottom'
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            if (context.datasetIndex === 0) {
                                label += context.parsed.y.toFixed(1) + '%';
                            } else {
                                label += context.parsed.y.toFixed(1) + ' дн';
                            }
                        }
                        return label;
                    }
                }
            }
        }
    });
}

// ===== ALERTS & ANOMALY DETECTION =====
function detectAnomalies() {
    const filteredData = filterData();
    const alerts = [];
    
    // 1. Производительность упала (сравнение с предыдущим периодом)
    const perfAlerts = detectPerformanceDrop(filteredData);
    alerts.push(...perfAlerts);
    
    // 2. Задачи долго в "In Progress"
    const stuckTasks = detectStuckTasks(filteredData);
    alerts.push(...stuckTasks);
    
    // 3. Перегруженные исполнители
    const overloadedAssignees = detectOverloadedAssignees(filteredData);
    alerts.push(...overloadedAssignees);
    
    // 4. Спринты отстают от плана
    const sprintAlerts = detectSprintIssues(filteredData);
    alerts.push(...sprintAlerts);
    
    // 5. Высокий процент отладки
    const debugAlerts = detectHighDebugRatio(filteredData);
    alerts.push(...debugAlerts);
    
    // 6. Задачи с большим перетреком
    const overtimeAlerts = detectOvertimeTasks(filteredData);
    alerts.push(...overtimeAlerts);
    
    return alerts;
}

function detectPerformanceDrop(data) {
    const alerts = [];
    const metrics = calculateMetrics(data, currentGrouping);
    
    // Use for loop instead of forEach
    for (let i = 0; i < metrics.length; i++) {
        const m = metrics[i];
        const perf = parseFloat(m.performance);
        
        // Критично: производительность < 70%
        if (perf < 70) {
            alerts.push({
                type: 'critical',
                icon: '🔴',
                title: `Критическая производительность: ${m.name}`,
                description: `Производительность <strong>${perf}%</strong> (норма ≥80%). Команда значительно перерасходует время.`,
                meta: `Производительность: ${perf}%`,
                action: () => openDetailsModal(m.name)
            });
        }
        // Предупреждение: производительность 70-80%
        else if (perf < 80) {
            alerts.push({
                type: 'warning',
                icon: '⚠️',
                title: `Низкая производительность: ${m.name}`,
                description: `Производительность <strong>${perf}%</strong> (норма ≥80%). Рекомендуется проверка оценок.`,
                meta: `Производительность: ${perf}%`,
                action: () => openDetailsModal(m.name)
            });
        }
    }
    
    return alerts;
}

function detectStuckTasks(data) {
    const alerts = [];
    const now = new Date();
    const criticalDays = 15;
    const warningDays = 10;
    
    // Use for loop instead of forEach
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (!item.resolutiondate) { // Незавершенные задачи
            const status = (item.status || '').toLowerCase();
            if (status.includes('progress') || status.includes('review')) {
                const created = new Date(item.created);
                const daysInProgress = Math.floor((now - created) / (1000 * 60 * 60 * 24));
                
                if (daysInProgress >= criticalDays) {
                    alerts.push({
                        type: 'critical',
                        icon: '⏰',
                        title: `Задача зависла: ${item.key}`,
                        description: `${item.summary}. Висит в "${item.status}" уже <strong>${daysInProgress} дней</strong>.`,
                        meta: `Исполнитель: ${item.assignee || 'Не назначен'} • ${daysInProgress} дней`,
                        action: () => window.open(`https://jira.surf.dev/browse/${item.key}`, '_blank')
                    });
                } else if (daysInProgress >= warningDays) {
                    alerts.push({
                        type: 'warning',
                        icon: '⏱️',
                        title: `Задача долго выполняется: ${item.key}`,
                        description: `${item.summary}. В "${item.status}" <strong>${daysInProgress} дней</strong>.`,
                        meta: `Исполнитель: ${item.assignee || 'Не назначен'} • ${daysInProgress} дней`,
                        action: () => window.open(`https://jira.surf.dev/browse/${item.key}`, '_blank')
                    });
                }
            }
        }
    }
    
    return alerts;
}

function detectOverloadedAssignees(data) {
    const alerts = [];
    const assigneeTasks = {};
    
    // Считаем активные задачи по исполнителям - use for loop
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (!item.resolutiondate && item.assignee) { // Незавершенные задачи
            if (!assigneeTasks[item.assignee]) {
                assigneeTasks[item.assignee] = [];
            }
            assigneeTasks[item.assignee].push(item);
        }
    }
    
    // Ищем перегруженных - use for loop
    const entries = Object.entries(assigneeTasks);
    for (let i = 0; i < entries.length; i++) {
        const [assignee, tasks] = entries[i];
        const criticalCount = 15;
        const warningCount = 10;
        
        if (tasks.length >= criticalCount) {
            alerts.push({
                type: 'critical',
                icon: '💥',
                title: `Критическая перегрузка: ${assignee}`,
                description: `<strong>${tasks.length} активных задач</strong>! Рекомендуется перераспределение нагрузки.`,
                meta: `Активных задач: ${tasks.length}`,
                action: () => {
                    currentGrouping = 'assignee';
                    updateDashboard();
                    setTimeout(() => openDetailsModal(assignee), 300);
                }
            });
        } else if (tasks.length >= warningCount) {
            alerts.push({
                type: 'warning',
                icon: '📊',
                title: `Высокая нагрузка: ${assignee}`,
                description: `<strong>${tasks.length} активных задач</strong>. Возможна перегрузка.`,
                meta: `Активных задач: ${tasks.length}`,
                action: () => {
                    currentGrouping = 'assignee';
                    updateDashboard();
                    setTimeout(() => openDetailsModal(assignee), 300);
                }
            });
        }
    }
    
    return alerts;
}

function detectSprintIssues(data) {
    const alerts = [];
    const sprintData = {};
    
    // Группируем по спринтам - use for loop
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const sprints = Array.isArray(item.sprint) ? item.sprint : 
                       (item.sprint ? [item.sprint] : ['Без спринта']);
        
        for (let j = 0; j < sprints.length; j++) {
            const sprint = sprints[j];
            if (sprint !== 'Без спринта') {
                if (!sprintData[sprint]) {
                    sprintData[sprint] = {
                        total: 0,
                        completed: 0,
                        inProgress: 0,
                        todo: 0
                    };
                }
                
                sprintData[sprint].total++;
                
                if (item.resolutiondate) {
                    sprintData[sprint].completed++;
                } else {
                    const status = (item.status || '').toLowerCase();
                    if (status.includes('progress') || status.includes('review')) {
                        sprintData[sprint].inProgress++;
                    } else {
                        sprintData[sprint].todo++;
                    }
                }
            }
        }
    }
    
    // Анализируем спринты - use for loop
    const entries = Object.entries(sprintData);
    for (let i = 0; i < entries.length; i++) {
        const [sprint, stats] = entries[i];
        const completionRate = (stats.completed / stats.total) * 100;
        const remainingTasks = stats.inProgress + stats.todo;
        
        // Если меньше 50% выполнено и есть задачи в работе/ожидании
        if (completionRate < 50 && remainingTasks > 5) {
            alerts.push({
                type: 'warning',
                icon: '🏃',
                title: `Спринт отстает: ${sprint}`,
                description: `Выполнено <strong>${completionRate.toFixed(0)}%</strong>, осталось <strong>${remainingTasks} задач</strong>. Возможно не успеем.`,
                meta: `Выполнено: ${stats.completed}/${stats.total} • Осталось: ${remainingTasks}`,
                action: () => {
                    currentGrouping = 'sprint';
                    updateDashboard();
                    setTimeout(() => openDetailsModal(sprint), 300);
                }
            });
        }
    }
    
    return alerts;
}

function detectHighDebugRatio(data) {
    const alerts = [];
    const metrics = calculateMetrics(data, currentGrouping);
    
    // Use for loop
    for (let i = 0; i < metrics.length; i++) {
        const m = metrics[i];
        const debugRatio = parseFloat(m.debugRatio);
        
        if (debugRatio > 30) {
            alerts.push({
                type: 'warning',
                icon: '🐛',
                title: `Высокий процент отладки: ${m.name}`,
                description: `<strong>${debugRatio}%</strong> времени на баги (норма <25%). Много технического долга или проблемы с качеством.`,
                meta: `Отладка: ${debugRatio}%`,
                action: () => openDetailsModal(m.name)
            });
        }
    }
    
    return alerts;
}

function detectOvertimeTasks(data) {
    const alerts = [];
    
    // Use for loop
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (item.resolutiondate) { // Только завершенные
            const spent = parseInt(item.timespent || 0, 10);
            const estimate = parseInt(item.timeoriginalestimate || 0, 10);
            
            if (estimate > 0 && spent > 0) {
                const overtime = spent - estimate;
                const overtimeHours = overtime / 3600; // Конвертируем секунды в часы
                
                // Критический перетрек: больше 10 часов
                if (overtimeHours > 10) {
                    alerts.push({
                        type: 'critical',
                        icon: '⏳',
                        title: `Критический перетрек: ${item.key}`,
                        description: `${item.summary}. Потрачено в <strong>${(spent/estimate).toFixed(1)}x раз</strong> больше оценки (перетрек <strong>+${formatTime(overtime)}</strong>).`,
                        meta: `Оценка: ${formatTime(estimate)} • Факт: ${formatTime(spent)} • +${formatTime(overtime)}`,
                        action: () => window.open(`https://jira.surf.dev/browse/${item.key}`, '_blank'),
                        overtimeValue: overtime // Для сортировки
                    });
                }
                // Предупреждение: перетрек есть, но меньше 10 часов
                else if (overtime > 0) {
                    alerts.push({
                        type: 'warning',
                        icon: '⚠️',
                        title: `Перетрек: ${item.key}`,
                        description: `${item.summary}. Потрачено в <strong>${(spent/estimate).toFixed(1)}x раз</strong> больше оценки (перетрек <strong>+${formatTime(overtime)}</strong>).`,
                        meta: `Оценка: ${formatTime(estimate)} • Факт: ${formatTime(spent)} • +${formatTime(overtime)}`,
                        action: () => window.open(`https://jira.surf.dev/browse/${item.key}`, '_blank'),
                        overtimeValue: overtime // Для сортировки
                    });
                }
            }
        }
    }
    
    // Сортируем по убыванию перетрека
    alerts.sort((a, b) => (b.overtimeValue || 0) - (a.overtimeValue || 0));
    
    // Берем топ-10 (было 5, увеличим так как теперь есть два типа)
    return alerts.slice(0, 10);
}

function renderAlerts(alerts) {
    const panel = document.getElementById('alertsPanel');
    const list = document.getElementById('alertsList');
    
    if (!alerts || alerts.length === 0) {
        panel.style.display = 'none';
        return;
    }
    
    // Сортируем: critical > warning > info
    const sortOrder = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => sortOrder[a.type] - sortOrder[b.type]);
    
    // Ограничиваем количество алертов
    const maxAlerts = 10;
    const displayAlerts = alerts.slice(0, maxAlerts);
    
    list.innerHTML = displayAlerts.map(alert => `
        <div class="alert-item ${alert.type}" onclick="handleAlertClick(this)" data-action="${alert.action ? 'true' : 'false'}">
            <div class="alert-icon">${alert.icon}</div>
            <div class="alert-content">
                <div class="alert-title">
                    ${alert.title}
                    <span class="alert-badge ${alert.type}">${alert.type === 'critical' ? 'КРИТИЧНО' : alert.type === 'warning' ? 'ВНИМАНИЕ' : 'ИНФО'}</span>
                </div>
                <div class="alert-description">${alert.description}</div>
                <div class="alert-meta">${alert.meta}</div>
            </div>
        </div>
    `).join('');
    
    // Сохраняем actions для обработки кликов
    window.currentAlertActions = displayAlerts.map(a => a.action);
    
    panel.style.display = 'block';
}

function handleAlertClick(element) {
    const index = Array.from(element.parentNode.children).indexOf(element);
    const action = window.currentAlertActions[index];
    
    if (action && typeof action === 'function') {
        action();
    }
}

function closeAlerts() {
    const panel = document.getElementById('alertsPanel');
    panel.style.display = 'none';
}

// Обновляем updateDashboard чтобы включить алерты и анализ размеров
// Используем IIFE чтобы избежать рекурсии
(function() {
    const originalUpdateDashboard = updateDashboard;
    
    updateDashboard = function() {
        try {
            console.log('→ originalUpdateDashboard()...');
            originalUpdateDashboard();
            console.log('✓ Original dashboard updated');
            
            console.log('→ filterData() for anomalies...');
            const filteredData = filterData();
            console.log(`✓ Filtered ${filteredData.length} items`);
            
            console.log('→ detectAnomalies()...');
            const alerts = detectAnomalies();
            console.log(`✓ Detected ${alerts.length} alerts`);
            
            console.log('→ renderAlerts()...');
            renderAlerts(alerts);
            console.log('✓ Alerts rendered');
            
            console.log('→ renderSizeAnalysis()...');
            renderSizeAnalysis(filteredData);
            console.log('✓ Size analysis rendered');
        } catch (e) {
            console.error('❌ Error in updateDashboard override:', e);
            throw e;
        }
    };
    
    window.updateDashboard = updateDashboard;
})();

// Export
window.closeAlerts = closeAlerts;
window.handleAlertClick = handleAlertClick;

// ============================================
// TABLE OF CONTENTS (TOC) FUNCTIONALITY
// ============================================

function initTOC() {
    console.log('Initializing TOC...');
    
    const tocNav = document.getElementById('tocNav');
    const currentTab = document.querySelector('.main-tab-btn.active')?.getAttribute('data-tab') || 'metrics';
    
    // Hide TOC if not on metrics tab
    if (tocNav) {
        if (currentTab === 'metrics') {
            tocNav.classList.remove('hidden');
        } else {
            tocNav.classList.add('hidden');
        }
    }
    
    // Build TOC structure based on current active tab
    buildTOCStructure();
    
    // Add scroll listener for active section highlighting
    window.addEventListener('scroll', highlightActiveSection);
    
    // Initial highlight
    highlightActiveSection();
}

function buildTOCStructure() {
    const tocList = document.getElementById('tocList');
    if (!tocList) return;
    
    const currentTab = document.querySelector('.main-tab-btn.active')?.getAttribute('data-tab') || 'metrics';
    
    let sections = [];
    
    if (currentTab === 'metrics') {
        sections = [
            { id: 'kpi-section', title: 'KPI Блоки', icon: '📊' },
            { id: 'table-container', title: 'Детальные метрики', icon: '📋' },
            { id: 'size-analysis-section', title: 'Анализ размеров задач', icon: '📏' },
            { id: 'alertsPanel', title: 'Проблемные зоны', icon: '⚠️' }
        ];
    } else if (currentTab === 'trends') {
        sections = [
            { id: 'trendsSection', title: 'Трендовый анализ', icon: '📈' },
            { id: 'trendsChartsContainer', title: 'Графики трендов', icon: '📊' }
        ];
    } else if (currentTab === 'math') {
        sections = [
            { id: 'mathTab', title: 'Математика', icon: '🧮' }
        ];
    }
    
    tocList.innerHTML = sections.map(section => `
        <li class="toc-item">
            <a href="#${section.id}" class="toc-link" onclick="scrollToSection('${section.id}'); return false;">
                ${section.icon} ${section.title}
            </a>
        </li>
    `).join('');
}

function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId) || document.querySelector(`.${sectionId}`);
    if (element) {
        const offset = 100; // Offset for fixed header
        const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
        const offsetPosition = elementPosition - offset;
        
        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
        
        // Update active state immediately
        setTimeout(() => highlightActiveSection(), 100);
    }
}

function highlightActiveSection() {
    const sections = document.querySelectorAll('[id]');
    const tocLinks = document.querySelectorAll('.toc-link');
    
    let currentSection = null;
    const scrollPosition = window.pageYOffset + 150;
    
    // Find the current section based on scroll position
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.offsetHeight;
        
        if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
            currentSection = section.id;
        }
    });
    
    // Update active class on TOC links
    tocLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.startsWith('#')) {
            const sectionId = href.substring(1);
            if (sectionId === currentSection) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        }
    });
}

function toggleTOC() {
    const tocNav = document.getElementById('tocNav');
    if (tocNav) {
        tocNav.classList.toggle('collapsed');
        
        // Save state to localStorage
        const isCollapsed = tocNav.classList.contains('collapsed');
        localStorage.setItem('tocCollapsed', isCollapsed);
    }
}

// Restore TOC state from localStorage
function restoreTOCState() {
    const tocNav = document.getElementById('tocNav');
    const isCollapsed = localStorage.getItem('tocCollapsed') === 'true';
    
    if (isCollapsed && tocNav) {
        tocNav.classList.add('collapsed');
    }
}

// Export TOC functions to window for access from other scripts
window.toggleTOC = toggleTOC;
window.scrollToSection = scrollToSection;
window.buildTOCStructure = buildTOCStructure;
window.highlightActiveSection = highlightActiveSection;

// Start
init();

// Initialize TOC after page load
window.addEventListener('DOMContentLoaded', () => {
    restoreTOCState();
    initTOC();
});

// ============================================
// JIRA INTEGRATION
// ============================================

/**
 * Opens filtered tasks in Jira with JQL query
 */
function openTasksInJira() {
    if (!currentDetailData || currentDetailData.length === 0) {
        alert('Нет задач для открытия в Jira');
        return;
    }
    
    // Apply current filters to get the filtered task list
    let filteredTasks = currentDetailData.filter(item => {
        const matchType = taskFilters.type === 'all' || (item.issuetype || 'Unknown') === taskFilters.type;
        const matchPriority = taskFilters.priority === 'all' || (item.priority || 'None') === taskFilters.priority;
        const matchSeverity = taskFilters.severity === 'all' || (item.severity || 'None') === taskFilters.severity;
        const matchBoard = taskFilters.board === 'all' || (item.board || 'No Board') === taskFilters.board;
        const matchProject = taskFilters.project === 'all' || (item.project_key || 'Unknown') === taskFilters.project;
        
        // Search filter
        let matchSearch = true;
        if (taskSearchQuery) {
            const query = taskSearchQuery.toLowerCase();
            const searchableText = [
                item.summary || '',
                item.key || '',
                item.issuetype || '',
                item.priority || '',
                item.severity || '',
                item.board || '',
                item.assignee || '',
                item.project_key || '',
                item.description || ''
            ].join(' ').toLowerCase();
            matchSearch = searchableText.includes(query);
        }
        
        return matchType && matchPriority && matchSeverity && matchBoard && matchProject && matchSearch;
    });
    
    if (filteredTasks.length === 0) {
        alert('Нет задач, соответствующих текущим фильтрам');
        return;
    }
    
    // Build JQL query
    const jqlParts = [];
    
    // 1. Task keys (IN clause)
    const taskKeys = filteredTasks.map(t => t.key).filter(k => k);
    if (taskKeys.length > 0) {
        // Jira has a limit on IN clause size (~1000 keys)
        // If too many tasks, use other filters
        if (taskKeys.length <= 100) {
            jqlParts.push(`key IN (${taskKeys.join(',')})`);
            
            // Add board filter if viewing by board grouping
            if (currentGrouping === 'board' && currentDetailName !== 'No Board') {
                jqlParts.push(`labels = "${currentDetailName}"`);
            }
            
            // Add board filter if applied in task modal filters
            if (taskFilters.board !== 'all') {
                jqlParts.push(`labels = "${taskFilters.board}"`);
            }
        } else {
            // Fallback: Use project, assignee, and other filters
            const projects = [...new Set(filteredTasks.map(t => t.project_key).filter(p => p))];
            if (projects.length > 0) {
                jqlParts.push(`project IN (${projects.join(',')})`);
            }
            
            // Add type filter if applied
            if (taskFilters.type !== 'all') {
                jqlParts.push(`type = "${taskFilters.type}"`);
            }
            
            // Add priority filter if applied
            if (taskFilters.priority !== 'all') {
                jqlParts.push(`priority = "${taskFilters.priority}"`);
            }
            
            // Add board filter if applied
            if (taskFilters.board !== 'all') {
                // Board is typically stored in labels in Jira
                jqlParts.push(`labels = "${taskFilters.board}"`);
            }
            
            // Add board filter if viewing by board
            if (currentGrouping === 'board' && currentDetailName !== 'No Board') {
                jqlParts.push(`labels = "${currentDetailName}"`);
            }
            
            // Add assignee if viewing by assignee
            if (currentGrouping === 'assignee' && currentDetailName !== 'Не назначен') {
                jqlParts.push(`assignee = "${currentDetailName}"`);
            }
            
            // Add text search if applied
            if (taskSearchQuery) {
                jqlParts.push(`(summary ~ "${taskSearchQuery}" OR description ~ "${taskSearchQuery}")`);
            }
        }
    }
    
    // Build final JQL
    const jql = jqlParts.join(' AND ');
    
    // Encode JQL for URL
    const encodedJQL = encodeURIComponent(jql);
    
    // Construct Jira URL
    const jiraBaseUrl = 'https://jira.surf.dev';
    const jiraUrl = `${jiraBaseUrl}/issues/?jql=${encodedJQL}`;
    
    // Open in new tab
    window.open(jiraUrl, '_blank');
    
    // Log for debugging
    console.log('Opening Jira with JQL:', jql);
    console.log('Filtered tasks count:', filteredTasks.length);
}

// Export function
window.openTasksInJira = openTasksInJira;

/**
 * Opens KPI-related tasks in Jira with JQL query
 */
function openKPITasksInJira() {
    // Check if we have KPI data
    if (!window.currentKPIData || !window.currentKPIData.filteredData) {
        alert('Нет данных для открытия в Jira');
        return;
    }
    
    const kpiData = window.currentKPIData;
    const filteredData = kpiData.filteredData;
    const metricType = kpiData.metricType;
    
    let tasksToOpen = [];
    
    // Determine which tasks to open based on KPI type and current filters
    if (metricType === 'cr') {
        // For CR: open all CR tasks
        tasksToOpen = filteredData.filter(item => isCR(item));
    } else {
        // For other metrics (performance, cycle, debug, comm): open all tasks from filtered data
        // If search is active, filter by assignee name
        const searchQuery = document.getElementById('kpiSearchInput')?.value?.toLowerCase() || '';
        
        if (searchQuery) {
            // Get assignees that match search
            const matchingAssignees = kpiData.metrics
                .filter(m => (m.name || '').toLowerCase().includes(searchQuery))
                .map(m => m.name);
            
            // Filter tasks by matching assignees
            tasksToOpen = filteredData.filter(item => {
                const assignee = item.assignee || 'Не назначен';
                return matchingAssignees.includes(assignee);
            });
        } else {
            // No search: use all filtered tasks
            tasksToOpen = [...filteredData];
        }
        
        // For debug and comm, filter by specific task types
        if (metricType === 'debug') {
            // Debug: only bugs and incidents on specific boards
            tasksToOpen = tasksToOpen.filter(item => {
                const type = (item.issuetype || '').toLowerCase();
                const isBugOrIncident = type === 'bug' || type === 'incident';
                const board = item.board || '';
                const allowedBoards = ['Flutter', 'iOS', 'Android', 'Frontend', 'Backend'];
                const isAllowedBoard = allowedBoards.includes(board);
                const isClosed = item.status === 'Closed' || item.status === 'Done' || item.resolutiondate;
                return isBugOrIncident && isAllowedBoard && isClosed;
            });
        } else if (metricType === 'comm') {
            // Comm: only service tasks
            tasksToOpen = tasksToOpen.filter(item => {
                const type = (item.issuetype || '').toLowerCase();
                return type === 'service task';
            });
        }
    }
    
    if (tasksToOpen.length === 0) {
        alert('Нет задач для открытия в Jira');
        return;
    }
    
    // Build JQL query
    const jqlParts = [];
    
    // Use task keys if reasonable number
    const taskKeys = tasksToOpen.map(t => t.key).filter(k => k);
    if (taskKeys.length > 0 && taskKeys.length <= 100) {
        jqlParts.push(`key IN (${taskKeys.join(',')})`);
    } else if (taskKeys.length > 100) {
        // Too many tasks: use filters instead
        const projects = [...new Set(tasksToOpen.map(t => t.project_key).filter(p => p))];
        if (projects.length > 0) {
            jqlParts.push(`project IN (${projects.join(',')})`);
        }
        
        // Add type filter based on metric
        if (metricType === 'debug') {
            jqlParts.push(`type IN (Bug, Incident)`);
        } else if (metricType === 'comm') {
            jqlParts.push(`type = "Service Task"`);
        }
        
        // Add board filter for debug
        if (metricType === 'debug') {
            // Note: This might need adjustment based on how boards are stored in Jira
            const boards = [...new Set(tasksToOpen.map(t => t.board).filter(b => b))];
            if (boards.length > 0 && boards.length <= 10) {
                // Boards might be in labels or custom fields
                // jqlParts.push(`labels IN (${boards.join(',')})`);
            }
        }
        
        // Add resolved status
        if (metricType === 'debug' || metricType === 'performance' || metricType === 'cycle') {
            jqlParts.push(`status IN (Closed, Done, Resolved)`);
        }
    }
    
    // Build final JQL
    const jql = jqlParts.join(' AND ');
    
    if (!jql) {
        alert('Не удалось построить JQL запрос');
        return;
    }
    
    // Encode JQL for URL
    const encodedJQL = encodeURIComponent(jql);
    
    // Construct Jira URL
    const jiraBaseUrl = 'https://jira.surf.dev';
    const jiraUrl = `${jiraBaseUrl}/issues/?jql=${encodedJQL}`;
    
    // Open in new tab
    window.open(jiraUrl, '_blank');
    
    // Log for debugging
    console.log('Opening KPI tasks in Jira with JQL:', jql);
    console.log('Metric type:', metricType);
    console.log('Tasks count:', tasksToOpen.length);
}

// Export function
window.openKPITasksInJira = openKPITasksInJira;

// ============================================
// FILE UPLOAD FUNCTIONALITY
// ============================================

/**
 * Handles file upload and reprocesses dashboard with new data
 */
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }
    
    // Validate file type
    if (!file.name.endsWith('.json')) {
        alert('Пожалуйста, выберите JSON файл');
        event.target.value = ''; // Reset input
        return;
    }
    
    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    loadingDiv.innerHTML = '<h2>Загрузка файла...</h2><p>Чтение и парсинг данных</p>';
    loadingDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.95); display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 10000;';
    document.body.appendChild(loadingDiv);
    
    try {
        console.log('📁 Reading uploaded file:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        
        // Read file
        const text = await file.text();
        loadingDiv.innerHTML = '<h2>Парсинг JSON...</h2><p>Преобразование данных</p>';
        
        // Parse JSON
        await new Promise(resolve => setTimeout(resolve, 100));
        let newData;
        try {
            newData = JSON.parse(text);
        } catch (parseError) {
            throw new Error(`Ошибка парсинга JSON: ${parseError.message}`);
        }
        
        // Validate data structure
        if (!Array.isArray(newData)) {
            throw new Error('Файл должен содержать массив задач');
        }
        
        if (newData.length === 0) {
            throw new Error('Файл не содержит задач');
        }
        
        // Check if first item has required fields
        const firstItem = newData[0];
        if (!firstItem.key) {
            throw new Error('Неверный формат данных: отсутствует поле "key"');
        }
        
        console.log(`✅ Parsed ${newData.length} issues from uploaded file`);
        
        // Update global data
        rawData = newData;
        
        // Reinitialize dashboard
        loadingDiv.innerHTML = '<h2>Обновление дашборда...</h2><p>Пересчет метрик</p>';
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Repopulate filters
        populateFilters();
        
        // Reset date filter to last 6 months
        const now = new Date();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);
        dateFilter.enabled = true;
        dateFilter.from = sixMonthsAgo;
        dateFilter.to = now;
        updateDateFilterTag();
        
        // Update dashboard
        await new Promise(resolve => setTimeout(resolve, 100));
        updateDashboard();
        
        // Update date range display
        updateDateRange();
        
        // Success message
        loadingDiv.innerHTML = `<h2>✅ Данные загружены!</h2><p>Обработано ${newData.length} задач</p>`;
        setTimeout(() => {
            document.body.removeChild(loadingDiv);
        }, 1500);
        
        console.log('✅ Dashboard updated with uploaded data');
        
        // Show notification
        showNotification(`Успешно загружено ${newData.length} задач из файла ${file.name}`, 'success');
        
    } catch (error) {
        console.error('❌ Error loading file:', error);
        loadingDiv.innerHTML = `<h2>❌ Ошибка загрузки</h2><p>${error.message}</p><button onclick="this.parentElement.parentElement.remove()" style="margin-top: 20px; padding: 10px 20px; background: #e74c3c; color: white; border: none; border-radius: 5px; cursor: pointer;">Закрыть</button>`;
        
        showNotification(`Ошибка загрузки файла: ${error.message}`, 'error');
    }
    
    // Reset file input
    event.target.value = '';
}

/**
 * Shows a notification message
 */
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10001;
        font-size: 14px;
        font-weight: 600;
        max-width: 400px;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentElement) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Export function
window.handleFileUpload = handleFileUpload;
