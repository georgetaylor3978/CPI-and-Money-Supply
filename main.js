import Chart from 'chart.js/auto';
import { parseISO, isAfter, isBefore, format } from 'date-fns';

const API_ENDPOINT = 'https://www.bankofcanada.ca/valet/observations/';
// Series mappings
const SERIES_IDS = {
    cpi: {
        'CPI_TRIM': 'CPI-Trim',
        'CPI_MEDIAN': 'CPI-Median',
        'CPI_COMMON': 'CPI-Common'
    },
    ms: {
        'STATIC_ATABLE_V37151': 'M1+',
        'STATIC_ATABLE_V37152': 'M1++',
        'STATIC_ATABLE_V41552801': 'M2++'
    }
};

const colors = {
    cpi: ['#f85149', '#ff7b72', '#ff948d', '#d29922'],
    ms: ['#238636', '#2ea043', '#3fb950', '#56d364']
};

let rawObservations = [];
let dualChartInstance = null;
let inflationChartInstance = null;

// UI Elements
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const loader1 = document.getElementById('loader-1');
const loader2 = document.getElementById('loader-2');
const cpiCheckboxes = Array.from(document.querySelectorAll('.cpi-btn input'));
const msCheckboxes = Array.from(document.querySelectorAll('.ms-btn input'));

async function init() {
    // Set default end date to today and start date to 2019-01-01
    startDateInput.value = '2019-01-01';
    endDateInput.value = format(new Date(), 'yyyy-MM-dd');

    // Bind Events
    startDateInput.addEventListener('change', updateCharts);
    endDateInput.addEventListener('change', updateCharts);
    cpiCheckboxes.forEach(cb => cb.addEventListener('change', updateCharts));
    msCheckboxes.forEach(cb => cb.addEventListener('change', updateCharts));

    // Fetch initial data
    await loadData();
    updateCharts();
}

async function loadData() {
    loader1.classList.add('active');
    loader2.classList.add('active');

    try {
        const seriesList = [
            ...Object.keys(SERIES_IDS.cpi),
            ...Object.keys(SERIES_IDS.ms),
            'STATIC_INFLATIONCALC' // For Indexing calculation
        ].join(',');

        // We fetch the last 300 records roughly 25 years or we can just fetch all?
        // Fetching all might take a tad longer but is cached. Let's fetch all relevant to 2000-onwards if possible, or just recent=360
        // Wait, Valet allows everything if we don't specify recent, or we can use start_date query param. Let's fetch all since 2000.
        const response = await fetch(`${API_ENDPOINT}${seriesList}/json?start_date=2000-01-01`);
        const data = await response.json();

        rawObservations = data.observations || [];
    } catch (e) {
        console.error("Error fetching BoC data:", e);
        alert("Failed to load Bank of Canada data.");
    } finally {
        loader1.classList.remove('active');
        loader2.classList.remove('active');
    }
}

function filterDataByDateRange() {
    const start = parseISO(startDateInput.value);
    const end = parseISO(endDateInput.value);

    return rawObservations.filter(obs => {
        const obsDate = parseISO(obs.d);
        return (!isBefore(obsDate, start)) && (!isAfter(obsDate, end));
    });
}

function updateCharts() {
    if (!rawObservations.length) return;

    const filteredData = filterDataByDateRange();

    // Extract dates for labels
    const labels = filteredData.map(obs => obs.d);

    drawDualChart(filteredData, labels);
    drawInflationChart(filteredData, labels);
}

function drawDualChart(data, labels) {
    const datasets = [];

    // Checked series
    const activeCpi = cpiCheckboxes.filter(cb => cb.checked).map(cb => cb.value);
    const activeMs = msCheckboxes.filter(cb => cb.checked).map(cb => cb.value);

    // CPI Data
    activeCpi.forEach((series, i) => {
        datasets.push({
            label: SERIES_IDS.cpi[series],
            data: data.map(obs => obs[series] ? parseFloat(obs[series].v) : null),
            borderColor: colors.cpi[i % colors.cpi.length],
            borderWidth: 2,
            pointRadius: 0,
            yAxisID: 'y',
            tension: 0.1
        });
    });

    // Money Supply Data
    activeMs.forEach((series, i) => {
        datasets.push({
            label: SERIES_IDS.ms[series],
            data: data.map(obs => obs[series] ? parseFloat(obs[series].v) : null),
            borderColor: colors.ms[i % colors.ms.length],
            borderWidth: 2,
            pointRadius: 0,
            yAxisID: 'y1',
            tension: 0.1
        });
    });

    const ctx = document.getElementById('dualChart').getContext('2d');

    if (dualChartInstance) {
        dualChartInstance.destroy();
    }

    dualChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y: {
                    type: 'linear',
                    display: activeCpi.length > 0,
                    position: 'left',
                    title: { display: true, text: 'CPI (%)', color: 'rgba(255,255,255,0.7)' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y1: {
                    type: 'linear',
                    display: activeMs.length > 0,
                    position: 'right',
                    title: { display: true, text: 'Money Supply (%)', color: 'rgba(255,255,255,0.7)' },
                    grid: { drawOnChartArea: false }
                }
            },
            plugins: {
                legend: { labels: { color: '#e6edf3' } }
            }
        }
    });
}

function drawInflationChart(data, labels) {
    if (!data.length) return;

    // Find the CPI value of the first month in the filtered range
    // We use theSTATIC_INFLATIONCALC index equivalent series for precise base calculation
    const baseObs = data.find(o => o['STATIC_INFLATIONCALC']);
    const baseValue = baseObs ? parseFloat(baseObs['STATIC_INFLATIONCALC'].v) : null;

    let indexData = [];
    if (baseValue) {
        indexData = data.map(obs => {
            const currentVal = obs['STATIC_INFLATIONCALC'] ? parseFloat(obs['STATIC_INFLATIONCALC'].v) : null;
            if (currentVal === null) return null;
            // Formula: (Current Index / Base Index) * 100
            return (currentVal / baseValue) * 100;
        });
    }

    const ctx = document.getElementById('inflationChart').getContext('2d');

    if (inflationChartInstance) {
        inflationChartInstance.destroy();
    }

    inflationChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Indexed Inflation (Base 100 on start date)',
                data: indexData,
                borderColor: '#2f81f7',
                backgroundColor: 'rgba(47, 129, 247, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y: {
                    title: { display: true, text: 'Index Value', color: 'rgba(255,255,255,0.7)' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                }
            },
            plugins: {
                legend: { labels: { color: '#e6edf3' } }
            }
        }
    });
}

// Start
init();
