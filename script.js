/**
 * ==============================================================================
 * Smart Garden V1 - Modern Client-Side IoT Web Dashboard
 * Pure Vanilla JavaScript (ES6+) Implementation
 * Features: MQTT.js WebSocket, Real-time Chart.js stream, Automation, Terminal Log
 * ==============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // ==========================================================================
  // 1. Default Configuration & State Management
  // ==========================================================================
  const DEFAULT_CONFIG = {
    brokerUrl: 'wss://broker.emqx.io:8084/mqtt',
    clientId: 'smartgarden_' + Math.random().toString(16).substring(2, 10),
    subTopic: 'kebun/demo/data',
    pubTopic: 'kebun/demo/control',
    dryThreshold: 40,
    wetThreshold: 65,
    autoMode: false,
    theme: 'dark'
  };

  const STORAGE_KEYS = {
    CONFIG: 'sg_v1_mqtt_config',
    THRESHOLDS: 'sg_v1_thresholds',
    THEME: 'sg_v1_theme'
  };

  // Active state
  let config = loadConfig();
  let mqttClient = null;
  let currentRelayState = 0; // 0 = OFF, 1 = ON
  let currentSoilPercent = 0;
  let currentAdc = 0;
  let simInterval = null;
  let isSimStreaming = false;

  // ==========================================================================
  // 2. DOM Elements Cache
  // ==========================================================================
  const DOM = {
    // Topbar
    themeToggle: document.getElementById('themeToggle'),
    themeIcon: document.getElementById('themeIcon'),
    mqttBadge: document.getElementById('mqttBadge'),
    mqttBadgeText: document.getElementById('mqttBadgeText'),

    // Hero & Clock
    brokerModeTag: document.getElementById('brokerModeTag'),
    clockTime: document.getElementById('clockTime'),
    clockDate: document.getElementById('clockDate'),

    // Quick Info
    infoBrokerUrl: document.getElementById('infoBrokerUrl'),
    infoSubTopic: document.getElementById('infoSubTopic'),
    infoPubTopic: document.getElementById('infoPubTopic'),
    infoLastSeen: document.getElementById('infoLastSeen'),

    // Telemetry - Moisture
    soilPercentVal: document.getElementById('soilPercentVal'),
    soilStatusBadge: document.getElementById('soilStatusBadge'),
    soilStatusText: document.getElementById('soilStatusText'),
    soilProgressBar: document.getElementById('soilProgressBar'),

    // Telemetry - ADC
    adcRawVal: document.getElementById('adcRawVal'),
    adcVoltText: document.getElementById('adcVoltText'),
    adcProgressBar: document.getElementById('adcProgressBar'),

    // Telemetry - Relay
    relayOrb: document.getElementById('relayOrb'),
    relayOrbIcon: document.getElementById('relayOrbIcon'),
    relayStatusText: document.getElementById('relayStatusText'),
    relayStatusDesc: document.getElementById('relayStatusDesc'),
    relayModeBadge: document.getElementById('relayModeBadge'),

    // Chart
    telemetryChartCanvas: document.getElementById('telemetryChart'),

    // Threshold Automation
    dryThresholdSlider: document.getElementById('dryThresholdSlider'),
    dryThresholdVal: document.getElementById('dryThresholdVal'),
    wetThresholdSlider: document.getElementById('wetThresholdSlider'),
    wetThresholdVal: document.getElementById('wetThresholdVal'),
    autoModeToggle: document.getElementById('autoModeToggle'),
    autoModeStatusText: document.getElementById('autoModeStatusText'),

    // Manual Controls
    btnPumpOn: document.getElementById('btnPumpOn'),
    btnPumpOff: document.getElementById('btnPumpOff'),
    controlTargetTopic: document.getElementById('controlTargetTopic'),
    btnSimulateData: document.getElementById('btnSimulateData'),
    btnToggleSimStream: document.getElementById('btnToggleSimStream'),
    simStreamIcon: document.getElementById('simStreamIcon'),
    simStreamText: document.getElementById('simStreamText'),

    // Terminal
    terminalConsole: document.getElementById('terminalConsole'),
    btnClearTerminal: document.getElementById('btnClearTerminal'),

    // Config Accordion & Form
    configAccordionBtn: document.getElementById('configAccordionBtn'),
    configAccordionBody: document.getElementById('configAccordionBody'),
    accordionArrowIcon: document.getElementById('accordionArrowIcon'),
    cfgBrokerUrl: document.getElementById('cfgBrokerUrl'),
    cfgClientId: document.getElementById('cfgClientId'),
    cfgSubTopic: document.getElementById('cfgSubTopic'),
    cfgPubTopic: document.getElementById('cfgPubTopic'),
    btnSaveConfig: document.getElementById('btnSaveConfig'),
    btnResetConfig: document.getElementById('btnResetConfig'),

    // Toast
    toastContainer: document.getElementById('toastContainer')
  };

  // ==========================================================================
  // 3. Application Initialization
  // ==========================================================================
  initTheme();
  initClock();
  initFormInputs();
  initThresholdsUI();
  initChart();
  setupEventListeners();
  connectMQTT();

  // Initial welcome terminal log
  logTerminal('sys', 'Smart Garden IoT Dashboard V1 diinisialisasi.');
  logTerminal('sys', `Target broker: ${config.brokerUrl}`);

  // ==========================================================================
  // 4. Clock Real-time
  // ==========================================================================
  function initClock() {
    function updateClock() {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(/\./g, ':');

      const dateStr = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      if (DOM.clockTime) DOM.clockTime.textContent = timeStr + ' WIB';
      if (DOM.clockDate) DOM.clockDate.textContent = dateStr;
    }

    updateClock();
    setInterval(updateClock, 1000);
  }

  // ==========================================================================
  // 5. Theme Toggle System
  // ==========================================================================
  function initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || DEFAULT_CONFIG.theme;
    applyTheme(savedTheme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEYS.THEME, theme);

    if (DOM.themeIcon) {
      if (theme === 'light') {
        DOM.themeIcon.className = 'fa-solid fa-moon';
        DOM.themeToggle.title = 'Ganti ke Mode Gelap';
      } else {
        DOM.themeIcon.className = 'fa-solid fa-sun';
        DOM.themeToggle.title = 'Ganti ke Mode Terang';
      }
    }

    // Update chart palette if chart instance exists
    if (chartInstance) {
      updateChartTheme(theme);
    }
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    showToast(`Beralih ke tema ${newTheme === 'dark' ? 'Gelap' : 'Terang'}`, 'info');
  }

  // ==========================================================================
  // 6. LocalStorage & Configuration Handling
  // ==========================================================================
  function loadConfig() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CONFIG);
      const thresholds = localStorage.getItem(STORAGE_KEYS.THRESHOLDS);

      const parsedConfig = stored ? JSON.parse(stored) : {};
      const parsedThresholds = thresholds ? JSON.parse(thresholds) : {};

      return {
        ...DEFAULT_CONFIG,
        ...parsedConfig,
        ...parsedThresholds
      };
    } catch (e) {
      console.warn('Gagal memuat konfigurasi dari localStorage, menggunakan default.', e);
      return { ...DEFAULT_CONFIG };
    }
  }

  function saveConfig(newConfig) {
    config = { ...config, ...newConfig };
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify({
      brokerUrl: config.brokerUrl,
      clientId: config.clientId,
      subTopic: config.subTopic,
      pubTopic: config.pubTopic
    }));
    localStorage.setItem(STORAGE_KEYS.THRESHOLDS, JSON.stringify({
      dryThreshold: config.dryThreshold,
      wetThreshold: config.wetThreshold,
      autoMode: config.autoMode
    }));
  }

  function initFormInputs() {
    if (DOM.cfgBrokerUrl) DOM.cfgBrokerUrl.value = config.brokerUrl;
    if (DOM.cfgClientId) DOM.cfgClientId.value = config.clientId;
    if (DOM.cfgSubTopic) DOM.cfgSubTopic.value = config.subTopic;
    if (DOM.cfgPubTopic) DOM.cfgPubTopic.value = config.pubTopic;

    // Quick info displays
    updateQuickInfoCards();
  }

  function updateQuickInfoCards() {
    if (DOM.infoBrokerUrl) {
      DOM.infoBrokerUrl.textContent = config.brokerUrl;
      DOM.infoBrokerUrl.title = config.brokerUrl;
    }
    if (DOM.infoSubTopic) {
      DOM.infoSubTopic.textContent = config.subTopic;
      DOM.infoSubTopic.title = config.subTopic;
    }
    if (DOM.infoPubTopic) {
      DOM.infoPubTopic.textContent = config.pubTopic;
      DOM.infoPubTopic.title = config.pubTopic;
    }
    if (DOM.controlTargetTopic) {
      DOM.controlTargetTopic.textContent = config.pubTopic;
    }
    if (DOM.brokerModeTag) {
      const isHive = config.brokerUrl.includes('hivemq');
      DOM.brokerModeTag.textContent = isHive ? 'HiveMQ WSS Cloud' : 'EMQX Public WSS';
    }
  }

  // ==========================================================================
  // 7. Threshold Automation UI & Logic
  // ==========================================================================
  function initThresholdsUI() {
    if (DOM.dryThresholdSlider) {
      DOM.dryThresholdSlider.value = config.dryThreshold;
      DOM.dryThresholdVal.textContent = `< ${config.dryThreshold}%`;
    }
    if (DOM.wetThresholdSlider) {
      DOM.wetThresholdSlider.value = config.wetThreshold;
      DOM.wetThresholdVal.textContent = `>= ${config.wetThreshold}%`;
    }
    if (DOM.autoModeToggle) {
      DOM.autoModeToggle.checked = config.autoMode;
      updateAutoModeUI(config.autoMode);
    }
  }

  function updateAutoModeUI(isEnabled) {
    if (DOM.autoModeStatusText) {
      if (isEnabled) {
        DOM.autoModeStatusText.textContent = `Mode otomatis AKTIF (Pompa menyala < ${config.dryThreshold}%, mati >= ${config.wetThreshold}%)`;
        DOM.autoModeStatusText.style.color = 'var(--emerald)';
        if (DOM.relayModeBadge) {
          DOM.relayModeBadge.textContent = 'OTOMATIS';
          DOM.relayModeBadge.style.background = 'var(--emerald-bg)';
          DOM.relayModeBadge.style.color = 'var(--emerald)';
        }
      } else {
        DOM.autoModeStatusText.textContent = 'Mode manual aktif (Irigasi dikendalikan via tombol manual)';
        DOM.autoModeStatusText.style.color = 'var(--text-dim)';
        if (DOM.relayModeBadge) {
          DOM.relayModeBadge.textContent = 'MANUAL';
          DOM.relayModeBadge.style.background = 'var(--indigo-bg)';
          DOM.relayModeBadge.style.color = 'var(--indigo)';
        }
      }
    }
  }

  // ==========================================================================
  // 8. MQTT Client Connection Management (MQTT.js via WebSocket)
  // ==========================================================================
  function setConnectionStatus(status) {
    if (!DOM.mqttBadge || !DOM.mqttBadgeText) return;

    DOM.mqttBadge.classList.remove('connected', 'connecting', 'disconnected');

    if (status === 'connected') {
      DOM.mqttBadge.classList.add('connected');
      DOM.mqttBadgeText.textContent = '● MQTT CONNECTED';
    } else if (status === 'connecting') {
      DOM.mqttBadge.classList.add('connecting');
      DOM.mqttBadgeText.textContent = '● MQTT CONNECTING';
    } else {
      DOM.mqttBadge.classList.add('disconnected');
      DOM.mqttBadgeText.textContent = '● MQTT DISCONNECTED';
    }
  }

  function connectMQTT() {
    if (typeof mqtt === 'undefined') {
      logTerminal('err', 'Pustaka MQTT.js tidak terdeteksi. Periksa koneksi internet / CDN.');
      setConnectionStatus('disconnected');
      return;
    }

    // Close any previous connection
    if (mqttClient) {
      try {
        mqttClient.end(true);
      } catch (e) {
        console.warn('Error closing existing MQTT client:', e);
      }
    }

    setConnectionStatus('connecting');
    logTerminal('sys', `Menghubungkan ke ${config.brokerUrl}... [ClientID: ${config.clientId}]`);

    const options = {
      clientId: config.clientId,
      clean: true,
      connectTimeout: 7000,
      reconnectPeriod: 5000,
      keepalive: 60
    };

    try {
      mqttClient = mqtt.connect(config.brokerUrl, options);

      mqttClient.on('connect', () => {
        setConnectionStatus('connected');
        logTerminal('sys', `● Terhubung ke MQTT Broker!`);

        // Subscribe to Data Topic
        mqttClient.subscribe(config.subTopic, { qos: 0 }, (err) => {
          if (err) {
            logTerminal('err', `Gagal subscribe topik: ${config.subTopic} (${err.message})`);
          } else {
            logTerminal('sys', `✔ Berhasil subscribe data topic: ${config.subTopic}`);
            showToast(`Terhubung ke MQTT Broker`, 'success');
          }
        });
      });

      mqttClient.on('message', (topic, message) => {
        const payloadStr = message.toString();
        logTerminal('in', `[${topic}] ${payloadStr}`);
        handleIncomingMessage(topic, payloadStr);
      });

      mqttClient.on('reconnect', () => {
        setConnectionStatus('connecting');
        logTerminal('sys', 'Mencoba menghubungkan ulang ke broker...');
      });

      mqttClient.on('close', () => {
        setConnectionStatus('disconnected');
      });

      mqttClient.on('offline', () => {
        setConnectionStatus('disconnected');
        logTerminal('err', 'Klien MQTT Offline');
      });

      mqttClient.on('error', (err) => {
        setConnectionStatus('disconnected');
        logTerminal('err', `Kesalahan MQTT: ${err.message || err}`);
      });

    } catch (error) {
      setConnectionStatus('disconnected');
      logTerminal('err', `Inisialisasi MQTT gagal: ${error.message}`);
    }
  }

  // ==========================================================================
  // 9. Incoming Telemetry Message Handler
  // ==========================================================================
  function handleIncomingMessage(topic, rawPayload) {
    // Update last seen timestamp
    const now = new Date();
    const timeFormatted = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\./g, ':');

    if (DOM.infoLastSeen) {
      DOM.infoLastSeen.textContent = `${timeFormatted} WIB`;
    }

    try {
      const data = JSON.parse(rawPayload);

      // Support field types: soil_percent, soil_adc, relay
      if (typeof data.soil_percent !== 'undefined') {
        const percent = Math.min(100, Math.max(0, parseInt(data.soil_percent, 10)));
        currentSoilPercent = percent;
        updateSoilMoistureUI(percent);
      }

      if (typeof data.soil_adc !== 'undefined') {
        const adc = Math.min(4095, Math.max(0, parseInt(data.soil_adc, 10)));
        currentAdc = adc;
        updateAdcUI(adc);
      }

      if (typeof data.relay !== 'undefined') {
        const relayVal = (data.relay === 1 || data.relay === '1' || data.relay === true) ? 1 : 0;
        currentRelayState = relayVal;
        updateRelayUI(relayVal);
      }

      // Stream data to Chart.js
      addDataToChart(timeFormatted, currentSoilPercent, currentAdc);

      // Check Automatic Irrigation Thresholds
      checkThresholdAutomation(currentSoilPercent);

    } catch (e) {
      logTerminal('err', `Format JSON tidak valid: ${e.message}`);
    }
  }

  // ==========================================================================
  // 10. Telemetry UI Updates
  // ==========================================================================
  function updateSoilMoistureUI(percent) {
    if (DOM.soilPercentVal) {
      DOM.soilPercentVal.textContent = percent;
    }

    // Dynamic Progress bar width
    if (DOM.soilProgressBar) {
      DOM.soilProgressBar.style.width = `${percent}%`;
    }

    // Soil condition classification
    // Sangat Kering (< 25%), Kering (< dryThreshold), Normal (< wetThreshold), Basah (>= wetThreshold)
    let conditionText = 'Normal';
    let conditionClass = 'normal';
    let barColorClass = 'emerald';
    let iconClass = 'fa-seedling';

    if (percent < 25) {
      conditionText = 'Sangat Kering';
      conditionClass = 'very-dry';
      barColorClass = 'rose';
      iconClass = 'fa-triangle-exclamation';
    } else if (percent < config.dryThreshold) {
      conditionText = 'Kering';
      conditionClass = 'dry';
      barColorClass = 'amber';
      iconClass = 'fa-faucet-drip';
    } else if (percent >= config.wetThreshold) {
      conditionText = 'Basah / Optimal';
      conditionClass = 'wet';
      barColorClass = 'cyan';
      iconClass = 'fa-droplet';
    } else {
      conditionText = 'Normal';
      conditionClass = 'normal';
      barColorClass = 'emerald';
      iconClass = 'fa-seedling';
    }

    if (DOM.soilStatusBadge) {
      DOM.soilStatusBadge.className = `status-pill ${conditionClass}`;
      DOM.soilStatusBadge.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${conditionText}</span>`;
    }

    if (DOM.soilProgressBar) {
      DOM.soilProgressBar.className = `meter-fill ${barColorClass}`;
    }
  }

  function updateAdcUI(adc) {
    if (DOM.adcRawVal) {
      DOM.adcRawVal.textContent = adc;
    }

    // Calculate voltage: 0 - 3.3V based on 12-bit (4095)
    const volt = ((adc / 4095) * 3.3).toFixed(2);
    if (DOM.adcVoltText) {
      DOM.adcVoltText.textContent = `${volt} V (0 - 3.3V)`;
    }

    // Progress bar width
    if (DOM.adcProgressBar) {
      const percentAdc = Math.min(100, Math.max(0, (adc / 4095) * 100));
      DOM.adcProgressBar.style.width = `${percentAdc.toFixed(1)}%`;
    }
  }

  function updateRelayUI(state) {
    const isRelayOn = state === 1;

    if (DOM.relayOrb) {
      DOM.relayOrb.className = `relay-orb-indicator ${isRelayOn ? 'on' : 'off'}`;
    }
    if (DOM.relayOrbIcon) {
      DOM.relayOrbIcon.className = `fa-solid ${isRelayOn ? 'fa-bolt' : 'fa-power-off'}`;
    }
    if (DOM.relayStatusText) {
      DOM.relayStatusText.className = `relay-state-text ${isRelayOn ? 'on' : 'off'}`;
      DOM.relayStatusText.textContent = isRelayOn ? 'ON' : 'OFF';
    }
    if (DOM.relayStatusDesc) {
      DOM.relayStatusDesc.textContent = isRelayOn
        ? 'Pompa irigasi sedang aktif menyiram tanaman'
        : 'Pompa irigasi sedang tidak mengalir';
    }
  }

  // ==========================================================================
  // 11. Threshold Automation Rules
  // ==========================================================================
  function checkThresholdAutomation(moisturePercent) {
    if (!config.autoMode) return;

    // Rule 1: Tanah di bawah batas kering -> Hidupkan Pompa
    if (moisturePercent < config.dryThreshold && currentRelayState === 0) {
      logTerminal('sys', `[AUTO-IRIGASI] Kelembapan (${moisturePercent}%) < Batas Kering (${config.dryThreshold}%). Mengaktifkan relay pompa...`);
      publishRelayCommand(1, 'Otomatisasi Ambang Batas Kering');
      showToast(`Irigasi Otomatis: Tanah kering (${moisturePercent}%), pompa dinyalakan!`, 'warning');
    }
    // Rule 2: Tanah mencapai atau melebihi batas cukup/basah -> Matikan Pompa
    else if (moisturePercent >= config.wetThreshold && currentRelayState === 1) {
      logTerminal('sys', `[AUTO-IRIGASI] Kelembapan (${moisturePercent}%) >= Batas Basah (${config.wetThreshold}%). Mematikan relay pompa...`);
      publishRelayCommand(0, 'Otomatisasi Ambang Batas Basah');
      showToast(`Irigasi Otomatis: Tanah cukup basah (${moisturePercent}%), pompa dimatikan!`, 'success');
    }
  }

  // ==========================================================================
  // 12. Publishing Relay Commands
  // ==========================================================================
  function publishRelayCommand(relayValue, reason = 'Kontrol Manual') {
    const payload = JSON.stringify({ relay: relayValue });

    if (!mqttClient || !mqttClient.connected) {
      logTerminal('err', `Gagal publish relay: MQTT broker belum terhubung!`);
      showToast('Koneksi MQTT belum terhubung!', 'error');

      // In offline / simulation mode, still update UI for great user experience
      currentRelayState = relayValue;
      updateRelayUI(relayValue);
      return;
    }

    mqttClient.publish(config.pubTopic, payload, { qos: 0 }, (err) => {
      if (err) {
        logTerminal('err', `Publish ke ${config.pubTopic} gagal: ${err.message}`);
        showToast('Gagal mengirim perintah ke broker', 'error');
      } else {
        logTerminal('out', `[${config.pubTopic}] ${payload} (${reason})`);
        showToast(`Perintah Pompa ${relayValue === 1 ? 'ON' : 'OFF'} terkirim!`, 'info');

        // Optimistically update relay status
        currentRelayState = relayValue;
        updateRelayUI(relayValue);
      }
    });
  }

  // ==========================================================================
  // 13. Chart.js Real-time Live Stream
  // ==========================================================================
  let chartInstance = null;
  const MAX_CHART_POINTS = 20;

  function initChart() {
    if (!DOM.telemetryChartCanvas || typeof Chart === 'undefined') return;

    const ctx = DOM.telemetryChartCanvas.getContext('2d');
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    // Initial dummy data placeholder
    const labels = ['Start'];
    const dataSoil = [45];
    const dataAdc = [2100];

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Kelembapan Tanah (%)',
            data: dataSoil,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 6,
            yAxisID: 'ySoil'
          },
          {
            label: 'Raw ADC Sensor (0 - 4095)',
            data: dataAdc,
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.05)',
            fill: false,
            tension: 0.35,
            borderWidth: 2,
            borderDash: [4, 4],
            pointRadius: 2,
            pointHoverRadius: 5,
            yAxisID: 'yAdc'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: isDark ? '#e2e8f0' : '#1e293b',
              font: {
                family: "'Plus Jakarta Sans', sans-serif",
                weight: '600',
                size: 12
              },
              usePointStyle: true,
              boxWidth: 8
            }
          },
          tooltip: {
            backgroundColor: isDark ? 'rgba(19, 21, 48, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#cbd5e1' : '#334155',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#cbd5e1',
            borderWidth: 1,
            padding: 10,
            boxPadding: 4,
            usePointStyle: true
          }
        },
        scales: {
          x: {
            grid: {
              color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
              drawBorder: false
            },
            ticks: {
              color: isDark ? '#64748b' : '#94a3b8',
              font: {
                family: "'JetBrains Mono', monospace",
                size: 11
              }
            }
          },
          ySoil: {
            type: 'linear',
            position: 'left',
            min: 0,
            max: 100,
            grid: {
              color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
              drawBorder: false
            },
            ticks: {
              color: '#10b981',
              font: {
                family: "'JetBrains Mono', monospace",
                size: 11
              },
              callback: (val) => val + '%'
            },
            title: {
              display: true,
              text: 'Kelembapan (%)',
              color: '#10b981',
              font: { size: 11, weight: '600' }
            }
          },
          yAdc: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: 4095,
            grid: {
              drawOnChartArea: false
            },
            ticks: {
              color: '#06b6d4',
              font: {
                family: "'JetBrains Mono', monospace",
                size: 11
              }
            },
            title: {
              display: true,
              text: 'Raw ADC (12-bit)',
              color: '#06b6d4',
              font: { size: 11, weight: '600' }
            }
          }
        }
      }
    });
  }

  function addDataToChart(timeLabel, soilVal, adcVal) {
    if (!chartInstance) return;

    chartInstance.data.labels.push(timeLabel);
    chartInstance.data.datasets[0].data.push(soilVal);
    chartInstance.data.datasets[1].data.push(adcVal);

    if (chartInstance.data.labels.length > MAX_CHART_POINTS) {
      chartInstance.data.labels.shift();
      chartInstance.data.datasets[0].data.shift();
      chartInstance.data.datasets[1].data.shift();
    }

    chartInstance.update('none'); // fast update without full re-animation
  }

  function updateChartTheme(theme) {
    if (!chartInstance) return;
    const isDark = theme === 'dark';

    chartInstance.options.plugins.legend.labels.color = isDark ? '#e2e8f0' : '#1e293b';
    chartInstance.options.plugins.tooltip.backgroundColor = isDark ? 'rgba(19, 21, 48, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    chartInstance.options.plugins.tooltip.titleColor = isDark ? '#f8fafc' : '#0f172a';
    chartInstance.options.plugins.tooltip.bodyColor = isDark ? '#cbd5e1' : '#334155';
    chartInstance.options.plugins.tooltip.borderColor = isDark ? 'rgba(255, 255, 255, 0.15)' : '#cbd5e1';

    chartInstance.options.scales.x.grid.color = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
    chartInstance.options.scales.x.ticks.color = isDark ? '#64748b' : '#94a3b8';
    chartInstance.options.scales.ySoil.grid.color = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

    chartInstance.update();
  }

  // ==========================================================================
  // 14. Terminal Logger / Network Inspector
  // ==========================================================================
  function logTerminal(type, text) {
    if (!DOM.terminalConsole) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\./g, ':');

    const line = document.createElement('div');
    line.className = 'terminal-line';

    let badgeClass = 'sys';
    let badgeText = 'SYS';

    if (type === 'in') {
      badgeClass = 'in';
      badgeText = 'RCV';
    } else if (type === 'out') {
      badgeClass = 'out';
      badgeText = 'PUB';
    } else if (type === 'err') {
      badgeClass = 'err';
      badgeText = 'ERR';
    }

    line.innerHTML = `
      <span class="terminal-time">[${timeStr}]</span>
      <span class="terminal-badge ${badgeClass}">${badgeText}</span>
      <span class="terminal-msg">${escapeHtml(text)}</span>
    `;

    DOM.terminalConsole.appendChild(line);

    // Limit maximum lines to 150
    while (DOM.terminalConsole.children.length > 150) {
      DOM.terminalConsole.removeChild(DOM.terminalConsole.firstChild);
    }

    // Auto-scroll to bottom
    DOM.terminalConsole.scrollTop = DOM.terminalConsole.scrollHeight;
  }

  function clearTerminal() {
    if (DOM.terminalConsole) {
      DOM.terminalConsole.innerHTML = '';
      logTerminal('sys', 'Layar terminal dibersihkan.');
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ==========================================================================
  // 15. Virtual ESP32 Simulator (Hardware-Free Testing)
  // ==========================================================================
  // Allows full testing of live stream, threshold trigger, & manual pump response!
  let simMoisture = 55;

  function generateSimulatedReading() {
    // If pump is ON -> moisture rises, ADC decreases
    if (currentRelayState === 1) {
      simMoisture = Math.min(96, simMoisture + (Math.floor(Math.random() * 5) + 3));
    } else {
      // If pump is OFF -> soil gradually dries, ADC increases
      simMoisture = Math.max(12, simMoisture - (Math.floor(Math.random() * 3) + 1));
    }

    // Invert ADC reading typical of soil moisture resistive/capacitive probe:
    // Wet = lower ADC raw reading, Dry = higher ADC raw reading
    const baseAdc = Math.round(4095 - (simMoisture / 100 * 3200) + (Math.random() * 80 - 40));
    const simAdc = Math.max(200, Math.min(4095, baseAdc));

    const simulatedPacket = {
      soil_adc: simAdc,
      soil_percent: simMoisture,
      relay: currentRelayState
    };

    const payloadString = JSON.stringify(simulatedPacket);

    // If connected to MQTT, publish to the subscribe topic so it loops through the broker!
    if (mqttClient && mqttClient.connected) {
      mqttClient.publish(config.subTopic, payloadString, { qos: 0 }, (err) => {
        if (err) {
          handleIncomingMessage(config.subTopic, payloadString);
        }
      });
    } else {
      // Local fallback
      handleIncomingMessage(config.subTopic, payloadString);
      logTerminal('in', `[SIMULASI LOCAL] ${payloadString}`);
    }
  }

  function toggleSimStream() {
    isSimStreaming = !isSimStreaming;

    if (isSimStreaming) {
      generateSimulatedReading();
      simInterval = setInterval(generateSimulatedReading, 3500);

      if (DOM.simStreamIcon) DOM.simStreamIcon.className = 'fa-solid fa-pause';
      if (DOM.simStreamText) DOM.simStreamText.textContent = 'Stop Stream';
      if (DOM.btnToggleSimStream) DOM.btnToggleSimStream.style.background = 'var(--rose-bg)';
      if (DOM.btnToggleSimStream) DOM.btnToggleSimStream.style.color = 'var(--rose)';

      showToast('Simulator ESP32 aktif (interval 3.5 detik)', 'info');
      logTerminal('sys', 'Virtual ESP32 Simulator diaktifkan.');
    } else {
      clearInterval(simInterval);
      simInterval = null;

      if (DOM.simStreamIcon) DOM.simStreamIcon.className = 'fa-solid fa-play';
      if (DOM.simStreamText) DOM.simStreamText.textContent = 'Auto Stream';
      if (DOM.btnToggleSimStream) DOM.btnToggleSimStream.style.background = 'var(--indigo-bg)';
      if (DOM.btnToggleSimStream) DOM.btnToggleSimStream.style.color = 'var(--indigo)';

      showToast('Simulator dihentikan', 'info');
      logTerminal('sys', 'Virtual ESP32 Simulator dihentikan.');
    }
  }

  // ==========================================================================
  // 16. Toast Notification Manager
  // ==========================================================================
  function showToast(message, type = 'info') {
    if (!DOM.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = 'toast';

    let icon = 'fa-circle-info';
    let iconColor = 'var(--cyan)';

    if (type === 'success') {
      icon = 'fa-circle-check';
      iconColor = 'var(--emerald)';
    } else if (type === 'warning') {
      icon = 'fa-triangle-exclamation';
      iconColor = 'var(--amber)';
    } else if (type === 'error') {
      icon = 'fa-circle-xmark';
      iconColor = 'var(--rose)';
    }

    toast.innerHTML = `
      <i class="fa-solid ${icon}" style="color: ${iconColor}; font-size: 1.2rem;"></i>
      <span style="flex:1;">${escapeHtml(message)}</span>
    `;

    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'all 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 350);
    }, 3500);
  }

  // ==========================================================================
  // 17. Event Listeners Registration
  // ==========================================================================
  function setupEventListeners() {
    // Theme toggle
    if (DOM.themeToggle) {
      DOM.themeToggle.addEventListener('click', toggleTheme);
    }

    // Manual Relay Buttons
    if (DOM.btnPumpOn) {
      DOM.btnPumpOn.addEventListener('click', () => {
        publishRelayCommand(1, 'Tombol Manual HIDUPKAN');
      });
    }

    if (DOM.btnPumpOff) {
      DOM.btnPumpOff.addEventListener('click', () => {
        publishRelayCommand(0, 'Tombol Manual MATIKAN');
      });
    }

    // Threshold Sliders
    if (DOM.dryThresholdSlider) {
      DOM.dryThresholdSlider.addEventListener('input', (e) => {
        let val = parseInt(e.target.value, 10);
        // Ensure dry threshold does not surpass wet threshold
        if (val >= config.wetThreshold) {
          val = config.wetThreshold - 5;
          e.target.value = val;
        }
        config.dryThreshold = val;
        if (DOM.dryThresholdVal) DOM.dryThresholdVal.textContent = `< ${val}%`;
        saveConfig({ dryThreshold: val });
        updateAutoModeUI(config.autoMode);
      });
    }

    if (DOM.wetThresholdSlider) {
      DOM.wetThresholdSlider.addEventListener('input', (e) => {
        let val = parseInt(e.target.value, 10);
        // Ensure wet threshold is higher than dry threshold
        if (val <= config.dryThreshold) {
          val = config.dryThreshold + 5;
          e.target.value = val;
        }
        config.wetThreshold = val;
        if (DOM.wetThresholdVal) DOM.wetThresholdVal.textContent = `>= ${val}%`;
        saveConfig({ wetThreshold: val });
        updateAutoModeUI(config.autoMode);
      });
    }

    // Automation Toggle
    if (DOM.autoModeToggle) {
      DOM.autoModeToggle.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        config.autoMode = isChecked;
        saveConfig({ autoMode: isChecked });
        updateAutoModeUI(isChecked);
        logTerminal('sys', `Mode otomatisasi irigasi ${isChecked ? 'DIAKTIFKAN' : 'DINONAKTIFKAN'}.`);
        showToast(`Mode otomatis ${isChecked ? 'Aktif' : 'Nonaktif'}`, isChecked ? 'success' : 'info');

        // Immediate check against current reading
        if (isChecked && currentSoilPercent > 0) {
          checkThresholdAutomation(currentSoilPercent);
        }
      });
    }

    // Virtual Simulator Buttons
    if (DOM.btnSimulateData) {
      DOM.btnSimulateData.addEventListener('click', () => {
        generateSimulatedReading();
        showToast('1 paket data uji coba berhasil dikirim!', 'info');
      });
    }

    if (DOM.btnToggleSimStream) {
      DOM.btnToggleSimStream.addEventListener('click', toggleSimStream);
    }

    // Terminal Clear Button
    if (DOM.btnClearTerminal) {
      DOM.btnClearTerminal.addEventListener('click', clearTerminal);
    }

    // MQTT Config Accordion
    if (DOM.configAccordionBtn) {
      DOM.configAccordionBtn.addEventListener('click', () => {
        const isExpanded = DOM.configAccordionBtn.getAttribute('aria-expanded') === 'true';
        DOM.configAccordionBtn.setAttribute('aria-expanded', !isExpanded);

        if (DOM.configAccordionBody) {
          DOM.configAccordionBody.classList.toggle('open', !isExpanded);
        }
        if (DOM.accordionArrowIcon) {
          DOM.accordionArrowIcon.classList.toggle('open', !isExpanded);
        }
      });
    }

    // Save & Apply Configuration
    if (DOM.btnSaveConfig) {
      DOM.btnSaveConfig.addEventListener('click', () => {
        const newBroker = DOM.cfgBrokerUrl.value.trim();
        const newClientId = DOM.cfgClientId.value.trim();
        const newSub = DOM.cfgSubTopic.value.trim();
        const newPub = DOM.cfgPubTopic.value.trim();

        if (!newBroker || !newClientId || !newSub || !newPub) {
          showToast('Harap lengkapi semua bidang konfigurasi!', 'error');
          return;
        }

        saveConfig({
          brokerUrl: newBroker,
          clientId: newClientId,
          subTopic: newSub,
          pubTopic: newPub
        });

        updateQuickInfoCards();
        logTerminal('sys', 'Konfigurasi MQTT diperbarui oleh pengguna.');
        showToast('Konfigurasi berhasil disimpan! Menghubungkan ulang...', 'success');

        // Reconnect with new settings immediately
        connectMQTT();
      });
    }

    // Reset Configuration to Defaults
    if (DOM.btnResetConfig) {
      DOM.btnResetConfig.addEventListener('click', () => {
        if (confirm('Kembalikan konfigurasi MQTT ke pengaturan default?')) {
          config = { ...DEFAULT_CONFIG };
          saveConfig(config);
          initFormInputs();
          initThresholdsUI();
          logTerminal('sys', 'Konfigurasi dikembalikan ke pengaturan default pabrik.');
          showToast('Konfigurasi dikembalikan ke default', 'info');
          connectMQTT();
        }
      });
    }
  }

});
