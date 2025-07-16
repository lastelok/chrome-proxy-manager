// Элементы DOM
const elements = {
    // Статус
    statusIndicator: document.getElementById('statusIndicator'),
    quickToggleBtn: document.getElementById('quickToggleBtn'),
    versionInfo: document.getElementById('versionInfo'),

    // Профили
    profilesList: document.getElementById('profilesList'),
    profilesCount: document.getElementById('profilesCount'),
    addProfileBtn: document.getElementById('addProfileBtn'),

    // Кнопки действий
    importBtn: document.getElementById('importBtn'),
    exportBtn: document.getElementById('exportBtn'),
    openSidePanelBtn: document.getElementById('openSidePanelBtn'),

    // Форма профиля
    profileForm: document.getElementById('profileForm'),
    proxyForm: document.getElementById('proxyForm'),
    formTitle: document.getElementById('formTitle'),
    closeFormBtn: document.getElementById('closeFormBtn'),
    cancelBtn: document.getElementById('cancelBtn'),

    // Поля формы
    profileId: document.getElementById('profileId'),
    profileName: document.getElementById('profileName'),
    proxyType: document.getElementById('proxyType'),
    proxyHost: document.getElementById('proxyHost'),
    proxyPort: document.getElementById('proxyPort'),
    useAuth: document.getElementById('useAuth'),
    authFields: document.getElementById('authFields'),
    proxyUsername: document.getElementById('proxyUsername'),
    proxyPassword: document.getElementById('proxyPassword'),

    // Импорт
    importForm: document.getElementById('importForm'),
    closeImportBtn: document.getElementById('closeImportBtn'),
    cancelImportBtn: document.getElementById('cancelImportBtn'),
    processImportBtn: document.getElementById('processImportBtn'),
    importText: document.getElementById('importText'),

    // Модальное окно подтверждения
    confirmModal: document.getElementById('confirmModal'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmYes: document.getElementById('confirmYes'),
    confirmNo: document.getElementById('confirmNo'),
}

// Состояние приложения
let state = {
    profiles: [],
    activeProfileId: null,
    editingProfileId: null,
    confirmCallback: null,
    geoCache: new Map(),
}

// Инициализация
document.addEventListener('DOMContentLoaded', init)

function init() {
    loadProfiles()
    updateStatus()
    bindEvents()
    loadGeoCache()
    loadVersionInfo()
    addDebugButton()
}

// Добавление кнопки отладки
function addDebugButton() {
    // Проверяем, не добавлена ли уже кнопка
    if (document.getElementById('debugBtn')) return

    const debugBtn = document.createElement('button')
    debugBtn.id = 'debugBtn'
    debugBtn.className = 'debug-btn'
    debugBtn.title = 'Отладка аутентификации'
    debugBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v6m0 6v6"/>
            <path d="m21 12-6 0m-6 0-6 0"/>
        </svg>
    `
    
    debugBtn.addEventListener('click', showDebugInfo)
    
    // Добавляем кнопку в header
    const headerRight = document.querySelector('.header-right')
    headerRight.insertBefore(debugBtn, headerRight.firstChild)
}

// Показ отладочной информации
function showDebugInfo() {
    chrome.runtime.sendMessage({ action: 'debugAuth' }, (response) => {
        if (response?.success) {
            const debug = response.debug
            let message = `🔍 ОТЛАДОЧНАЯ ИНФОРМАЦИЯ\n\n`
            message += `📡 Прокси активен: ${debug.isActive ? 'ДА' : 'НЕТ'}\n`
            
            if (debug.currentProfile) {
                message += `📋 Текущий профиль: ${debug.currentProfile.name}\n`
                message += `🌐 Хост: ${debug.currentProfile.host}:${debug.currentProfile.port}\n`
                message += `🔗 Тип: ${debug.currentProfile.type || 'http'}\n`
                message += `👤 Логин в профиле: ${debug.currentProfile.username || 'НЕ ЗАДАН'}\n`
                message += `🔐 Пароль в профиле: ${debug.currentProfile.password ? 'ЗАДАН' : 'НЕ ЗАДАН'}\n`
            } else {
                message += `📋 Текущий профиль: НЕТ\n`
            }
            
            if (debug.authCredentials) {
                message += `\n🔑 АКТИВНЫЕ УЧЕТНЫЕ ДАННЫЕ:\n`
                message += `👤 Логин: ${debug.authCredentials.username || 'НЕ ЗАДАН'}\n`
                message += `🔐 Пароль: ${debug.authCredentials.password ? 'ЗАДАН (' + debug.authCredentials.password.length + ' символов)' : 'НЕ ЗАДАН'}\n`
            } else {
                message += `\n🔑 АКТИВНЫЕ УЧЕТНЫЕ ДАННЫЕ: НЕ ЗАДАНЫ\n`
            }
            
            if (debug.pendingAuthCredentials) {
                message += `\n⏳ ОЖИДАЮЩИЕ УЧЕТНЫЕ ДАННЫЕ:\n`
                message += `👤 Логин: ${debug.pendingAuthCredentials.username || 'НЕ ЗАДАН'}\n`
                message += `🔐 Пароль: ${debug.pendingAuthCredentials.password ? 'ЗАДАН' : 'НЕ ЗАДАН'}\n`
            }
            
            message += `\n🆘 ЕСЛИ АВТОРИЗАЦИЯ НЕ РАБОТАЕТ:\n`
            message += `1. Проверьте правильность логина и пароля\n`
            message += `2. Перезагрузите расширение (chrome://extensions/)\n`
            message += `3. Откройте DevTools (F12) и проверьте логи\n`
            message += `4. Попробуйте отключить и снова включить прокси\n\n`
            message += `💡 Попробуйте открыть httpbin.org/ip для проверки`
            
            showConfirmDialog(message)
        } else {
            showConfirmDialog('❌ Ошибка получения отладочной информации')
        }
    })
}

// Загрузка кеша геолокации
function loadGeoCache() {
    chrome.storage.local.get(['geoCache'], (result) => {
        if (result.geoCache) {
            state.geoCache = new Map(Object.entries(result.geoCache))
        }
    })
}

// Загрузка версии из манифеста
function loadVersionInfo() {
    const manifest = chrome.runtime.getManifest()
    if (manifest && manifest.version) {
        elements.versionInfo.textContent = `v${manifest.version}`
    }
}

// Получение геолокации
async function getGeoLocation(ip) {
    // Проверяем локальный кеш
    if (state.geoCache.has(ip)) {
        const cached = state.geoCache.get(ip)
        // Проверяем актуальность (24 часа)
        if (cached.lastUpdated && Date.now() - cached.lastUpdated < 24 * 60 * 60 * 1000) {
            return cached
        }
    }

    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getGeoLocation', ip }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Ошибка получения геолокации:', chrome.runtime.lastError)
                resolve({
                    country: 'Неизвестно',
                    countryCode: null,
                    city: null,
                    timezone: null
                })
                return
            }

            if (response?.success && response.data) {
                // Обновляем локальный кеш
                state.geoCache.set(ip, response.data)
                resolve(response.data)
            } else {
                resolve({
                    country: 'Неизвестно',
                    countryCode: null,
                    city: null,
                    timezone: null
                })
            }
        })
    })
}

// Получение URL флага
function getFlagUrl(countryCode) {
    if (!countryCode) return null
    return `https://flagcdn.com/24x18/${countryCode}.png`
}

// Привязка событий
function bindEvents() {
    // Основные действия
    elements.addProfileBtn.addEventListener('click', showAddProfileForm)
    elements.quickToggleBtn.addEventListener('click', handleQuickToggle)
    elements.importBtn.addEventListener('click', showImportForm)
    elements.exportBtn.addEventListener('click', exportProfiles)
    elements.openSidePanelBtn.addEventListener('click', openInSidePanel)

    // Форма профиля
    elements.proxyForm.addEventListener('submit', handleFormSubmit)
    elements.closeFormBtn.addEventListener('click', hideProfileForm)
    elements.cancelBtn.addEventListener('click', hideProfileForm)
    elements.useAuth.addEventListener('change', toggleAuthFields)

    // Импорт
    elements.closeImportBtn.addEventListener('click', hideImportForm)
    elements.cancelImportBtn.addEventListener('click', hideImportForm)
    elements.processImportBtn.addEventListener('click', processImport)

    // Подтверждение
    elements.confirmYes.addEventListener('click', handleConfirmYes)
    elements.confirmNo.addEventListener('click', handleConfirmNo)

    // Закрытие модальных окон
    elements.profileForm.addEventListener('click', (e) => {
        if (e.target === elements.profileForm) hideProfileForm()
    })

    elements.importForm.addEventListener('click', (e) => {
        if (e.target === elements.importForm) hideImportForm()
    })

    elements.confirmModal.addEventListener('click', (e) => {
        if (e.target === elements.confirmModal) handleConfirmNo()
    })

    // Клавиатурные сокращения
    document.addEventListener('keydown', handleKeyDown)
}

// Обработка клавиш
function handleKeyDown(e) {
    if (e.key === 'Escape') {
        if (!elements.confirmModal.classList.contains('hidden')) {
            handleConfirmNo()
        } else if (!elements.profileForm.classList.contains('hidden')) {
            hideProfileForm()
        } else if (!elements.importForm.classList.contains('hidden')) {
            hideImportForm()
        }
    }
}

// Загрузка профилей
function loadProfiles() {
    chrome.storage.local.get(['profiles', 'activeProfileId'], (result) => {
        state.profiles = result.profiles || []
        state.activeProfileId = result.activeProfileId || null
        renderProfiles()
    })
}

// Сохранение профилей
function saveProfiles() {
    chrome.storage.local.set({
        profiles: state.profiles,
        activeProfileId: state.activeProfileId,
    })
}

// Обновление статуса
function updateStatus() {
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Ошибка получения статуса:', chrome.runtime.lastError)
            return
        }

        const statusTitle = elements.statusIndicator.querySelector('.status-title')
        const statusSubtitle = elements.statusIndicator.querySelector('.status-subtitle')

        if (response?.isActive && response?.currentProfile) {
            elements.statusIndicator.classList.add('active')
            elements.quickToggleBtn.classList.add('active')
            statusTitle.textContent = `Подключено: ${response.currentProfile.name}`
            statusSubtitle.textContent = response.currentProfile.host
            state.activeProfileId = response.currentProfile.id

            // Сохраняем последний активный профиль для быстрого доступа
            localStorage.setItem('lastActiveProfile', response.currentProfile.id)
        } else {
            elements.statusIndicator.classList.remove('active')
            elements.quickToggleBtn.classList.remove('active')
            statusTitle.textContent = 'Прямое подключение'
            statusSubtitle.textContent = 'Прокси отключен'
            state.activeProfileId = null
        }

        renderProfiles()
    })
}

// Отрисовка профилей
function renderProfiles() {
    const count = state.profiles.length
    elements.profilesCount.textContent = count
    elements.profilesList.innerHTML = ''

    if (count === 0) {
        elements.profilesList.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    <path d="M2 12h20"/>
                </svg>
                <div>Нет сохраненных профилей</div>
                <div style="font-size: 12px; margin-top: 4px;">Создайте первый профиль для начала работы</div>
            </div>
        `
        return
    }

    const sortedProfiles = [...state.profiles].sort((a, b) => a.name.localeCompare(b.name))

    sortedProfiles.forEach((profile) => {
        const profileElement = createProfileElement(profile)
        elements.profilesList.appendChild(profileElement)
    })
}

// Создание элемента профиля
function createProfileElement(profile) {
    const isActive = profile.id === state.activeProfileId

    const element = document.createElement('div')
    element.className = `profile-card ${isActive ? 'active' : ''}`
    element.dataset.id = profile.id

    element.innerHTML = `
        <div class="profile-header">
            <div class="profile-name">${escapeHtml(profile.name)}</div>
            <div class="profile-actions">
                <button class="profile-action-btn copy-btn" title="Копировать">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                </button>
                <button class="profile-action-btn edit-btn" title="Редактировать">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="profile-action-btn delete-btn" title="Удалить">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="profile-details">
            <span class="profile-type ${profile.type || 'http'}">${(profile.type || 'http').toUpperCase()}</span>
            <span>${escapeHtml(profile.host)}:${profile.port}</span>
            ${profile.username ? '<span class="auth-indicator">🔐</span>' : ''}
            <div class="geo-info" data-ip="${profile.host}">
                <span class="geo-loading">🌍</span>
            </div>
        </div>
    `

    // Загружаем геолокацию асинхронно
    loadGeolocationForElement(element, profile.host)

    // События
    element.addEventListener('click', (e) => {
        if (!e.target.closest('.profile-actions')) {
            activateProfile(profile.id)
        }
    })

    element.querySelector('.copy-btn').addEventListener('click', (e) => {
        e.stopPropagation()
        copyProfile(profile)
    })

    element.querySelector('.edit-btn').addEventListener('click', (e) => {
        e.stopPropagation()
        editProfile(profile.id)
    })

    element.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation()
        deleteProfile(profile.id)
    })

    return element
}

// Загрузка геолокации для элемента
async function loadGeolocationForElement(element, ip) {
    const geoInfoElement = element.querySelector('.geo-info')
    
    try {
        const geoData = await getGeoLocation(ip)
        
        if (geoData.countryCode) {
            const flagUrl = getFlagUrl(geoData.countryCode)
            const countryInfo = geoData.city ? `${geoData.city}, ${geoData.country}` : geoData.country
            
            geoInfoElement.innerHTML = `
                <img src="${flagUrl}" 
                     alt="${geoData.country}" 
                     class="country-flag" 
                     title="${countryInfo}"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='inline'">
                <span class="country-name" style="display: none">${geoData.country}</span>
            `
        } else {
            geoInfoElement.innerHTML = `<span class="country-name">${geoData.country}</span>`
        }
    } catch (error) {
        console.error('Ошибка загрузки геолокации:', error)
        geoInfoElement.innerHTML = '<span class="country-name">Неизвестно</span>'
    }
}

// Активация профиля
function activateProfile(profileId) {
    const profile = state.profiles.find((p) => p.id === profileId)
    if (!profile) return

    console.log('🔄 Активируем профиль:', {
        name: profile.name,
        host: profile.host,
        port: profile.port,
        hasAuth: !!(profile.username && profile.password),
        username: profile.username || 'НЕТ',
        password: profile.password ? '***' : 'НЕТ'
    })

    // Проверяем, есть ли авторизация
    const hasAuth = profile.username && profile.password

    const profileElement = document.querySelector(`[data-id="${profileId}"]`)
    if (profileElement) {
        profileElement.classList.add('loading')
    }

    // ВАЖНО: Передаем полный объект профиля с учетными данными
    chrome.runtime.sendMessage({ action: 'applyProxy', profile: profile }, (response) => {
        if (profileElement) {
            profileElement.classList.remove('loading')
        }

        if (response?.success) {
            state.activeProfileId = profileId
            saveProfiles()
            updateStatus()
            
            // Показываем информацию о работе с авторизацией
            if (hasAuth) {
                showToast('Прокси подключен. Авторизация настроена автоматически')
                console.log('✅ Профиль с авторизацией успешно активирован')
            } else {
                showToast('Прокси подключен')
                console.log('✅ Профиль без авторизации успешно активирован')
            }
        } else {
            console.error('❌ Ошибка активации профиля:', response?.error)
            showConfirmDialog('Ошибка при подключении к прокси-серверу: ' + (response?.error || 'Неизвестная ошибка'))
        }
    })
}

// Отключение прокси
function disableProxy() {
    chrome.runtime.sendMessage({ action: 'disableProxy' }, (response) => {
        if (response?.success) {
            state.activeProfileId = null
            saveProfiles()
            updateStatus()
        }
    })
}

// Быстрое переключение
function handleQuickToggle() {
    if (state.activeProfileId) {
        console.log('🔌 Отключаем текущий прокси')
        disableProxy()
    } else if (state.profiles.length > 0) {
        // Активируем последний использованный или первый профиль
        const lastProfileId = localStorage.getItem('lastActiveProfile')
        const profileToActivate = lastProfileId && state.profiles.find((p) => p.id === lastProfileId) ? lastProfileId : state.profiles[0].id
        
        const profile = state.profiles.find((p) => p.id === profileToActivate)
        console.log('⚡ Быстрое переключение на профиль:', {
            name: profile?.name,
            hasAuth: !!(profile?.username && profile?.password)
        })
        
        activateProfile(profileToActivate)
    } else {
        console.log('➕ Нет профилей, открываем форму создания')
        showAddProfileForm()
    }
}

// Копирование профиля
function copyProfile(profile) {
    let text = ''
    if (profile.type && profile.type !== 'http') {
        text += `${profile.type.toUpperCase()} `
    }

    if (profile.username && profile.password) {
        text += `${profile.username}:${profile.password}@${profile.host}:${profile.port}`
    } else {
        text += `${profile.host}:${profile.port}`
    }

    navigator.clipboard
        .writeText(text)
        .then(() => {
            showToast('Скопировано в буфер обмена')
        })
        .catch(() => {
            showConfirmDialog('Не удалось скопировать в буфер обмена')
        })
}

// Показ формы добавления профиля
function showAddProfileForm() {
    state.editingProfileId = null
    elements.formTitle.textContent = 'Новый профиль'
    elements.proxyForm.reset()
    elements.proxyType.value = 'http'
    elements.useAuth.checked = false
    toggleAuthFields()
    elements.profileForm.classList.remove('hidden')

    setTimeout(() => {
        elements.profileName.focus()
    }, 100)
}

// Скрытие формы профиля
function hideProfileForm() {
    elements.profileForm.classList.add('hidden')
    elements.proxyForm.reset()
    state.editingProfileId = null
}

// Переключение полей авторизации
function toggleAuthFields() {
    if (elements.useAuth.checked) {
        elements.authFields.classList.remove('hidden')
    } else {
        elements.authFields.classList.add('hidden')
        elements.proxyUsername.value = ''
        elements.proxyPassword.value = ''
    }
}

// Обработка отправки формы
async function handleFormSubmit(e) {
    e.preventDefault()

    const formData = {
        name: elements.profileName.value.trim(),
        type: elements.proxyType.value,
        host: elements.proxyHost.value.trim(),
        port: elements.proxyPort.value.trim(),
        username: elements.useAuth.checked ? elements.proxyUsername.value.trim() : '',
        password: elements.useAuth.checked ? elements.proxyPassword.value.trim() : '',
    }

    // Валидация
    if (!formData.name || !formData.host || !formData.port) {
        showConfirmDialog('Пожалуйста, заполните все обязательные поля')
        return
    }

    const port = parseInt(formData.port)
    if (isNaN(port) || port < 1 || port > 65535) {
        showConfirmDialog('Порт должен быть числом от 1 до 65535')
        return
    }

    // Проверка дублирования имени
    const duplicate = state.profiles.find((p) => p.name.toLowerCase() === formData.name.toLowerCase() && p.id !== state.editingProfileId)

    if (duplicate) {
        showConfirmDialog('Профиль с таким именем уже существует')
        return
    }

    if (state.editingProfileId) {
        // Редактирование
        const index = state.profiles.findIndex((p) => p.id === state.editingProfileId)
        if (index !== -1) {
            state.profiles[index] = { ...formData, id: state.editingProfileId }

            // Если редактируем активный профиль, переподключаемся
            if (state.editingProfileId === state.activeProfileId) {
                activateProfile(state.editingProfileId)
            }
        }
    } else {
        // Добавление
        const newProfile = { ...formData, id: Date.now().toString() }
        state.profiles.push(newProfile)
    }

    saveProfiles()
    renderProfiles()
    hideProfileForm()

    showToast(state.editingProfileId ? 'Профиль обновлен' : 'Профиль создан')
}

// Редактирование профиля
function editProfile(profileId) {
    const profile = state.profiles.find((p) => p.id === profileId)
    if (!profile) return

    state.editingProfileId = profileId
    elements.formTitle.textContent = 'Редактировать профиль'

    elements.profileName.value = profile.name
    elements.proxyType.value = profile.type || 'http'
    elements.proxyHost.value = profile.host
    elements.proxyPort.value = profile.port

    const hasAuth = profile.username || profile.password
    elements.useAuth.checked = hasAuth

    if (hasAuth) {
        elements.proxyUsername.value = profile.username || ''
        elements.proxyPassword.value = profile.password || ''
    }

    toggleAuthFields()
    elements.profileForm.classList.remove('hidden')

    setTimeout(() => {
        elements.profileName.focus()
    }, 100)
}

// Удаление профиля
function deleteProfile(profileId) {
    const profile = state.profiles.find((p) => p.id === profileId)
    if (!profile) return

    showConfirmDialog(`Удалить профиль "${profile.name}"?`, () => {
        state.profiles = state.profiles.filter((p) => p.id !== profileId)

        if (state.activeProfileId === profileId) {
            disableProxy()
        }

        saveProfiles()
        renderProfiles()
        showToast('Профиль удален')
    })
}

// Показ формы импорта
function showImportForm() {
    elements.importForm.classList.remove('hidden')
    setTimeout(() => {
        elements.importText.focus()
    }, 100)
}

// Скрытие формы импорта
function hideImportForm() {
    elements.importForm.classList.add('hidden')
    elements.importText.value = ''
}

// Генерация уникального имени профиля для импорта
function generateUniqueImportName(baseName, counter) {
    const existingNames = state.profiles.map(p => p.name.toLowerCase())
    let name = baseName
    
    if (counter > 1) {
        name = `${baseName} ${counter}`
    }
    
    // Если имя уже существует, увеличиваем счетчик
    if (existingNames.includes(name.toLowerCase())) {
        return generateUniqueImportName(baseName, counter + 1)
    }
    
    return name
}

// Парсинг строки прокси
function parseProxyLine(line) {
    line = line.trim()
    if (!line) return null

    let customName = null
    let proxyType = 'http'

    // Проверка на имя профиля (формат: Название;остальная_часть)
    // Точка с запятой указывает на наличие пользовательского названия
    if (line.includes(';')) {
        const nameMatch = line.match(/^([^;]+);(.+)$/)
        if (nameMatch) {
            customName = nameMatch[1].trim()
            line = nameMatch[2].trim()
        }
    }

    // Проверка типа прокси
    const typeMatch = line.match(/^(socks5|socks4|http|https)\s+(.+)$/i)
    if (typeMatch) {
        proxyType = typeMatch[1].toLowerCase()
        line = typeMatch[2].trim()
    }

    let result = null

    // user:pass@host:port - улучшенная версия
    const authFormat1 = line.match(/^([^:@\s]+):([^@\s]+)@([^:\s]+):(\d+)$/)
    if (authFormat1) {
        result = {
            username: authFormat1[1],
            password: authFormat1[2], 
            host: authFormat1[3],
            port: authFormat1[4],
            type: proxyType,
        }
    }

    // host:port:user:pass
    if (!result) {
        const authFormat2 = line.match(/^([^:\s]+):(\d+):([^:\s]+):(.+)$/)
        if (authFormat2) {
            result = {
                host: authFormat2[1],
                port: authFormat2[2],
                username: authFormat2[3],
                password: authFormat2[4],
                type: proxyType,
            }
        }
    }

    // host:port
    if (!result) {
        const simpleFormat = line.match(/^([^:\s]+):(\d+)$/)
        if (simpleFormat) {
            result = {
                host: simpleFormat[1],
                port: simpleFormat[2],
                username: '',
                password: '',
                type: proxyType,
            }
        }
    }

    if (result && customName) {
        result.customName = customName
    }

    return result
}

// Обработка импорта
async function processImport() {
    const text = elements.importText.value.trim()
    if (!text) {
        showConfirmDialog('Введите данные для импорта')
        return
    }

    const lines = text.split('\n')
    let imported = 0
    let skipped = 0
    let firstProfileId = null
    let importCounter = 1
    let errors = []

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index]
        const parsed = parseProxyLine(line)

        if (parsed) {
            // Проверка на дублирование
            const exists = state.profiles.some(
                (p) => p.host === parsed.host && p.port === parsed.port && (p.username || '') === (parsed.username || '')
            )

            if (exists) {
                skipped++
                errors.push(`Строка ${index + 1}: Прокси ${parsed.host}:${parsed.port} уже существует`)
                continue
            }

            // Генерируем уникальное имя для профиля
            let profileName
            if (parsed.customName) {
                profileName = generateUniqueImportName(parsed.customName, 1)
            } else {
                profileName = generateUniqueImportName('Прокси', importCounter)
                importCounter++
            }

            const newProfile = {
                name: profileName,
                type: parsed.type,
                host: parsed.host,
                port: parsed.port,
                username: parsed.username || '',
                password: parsed.password || '',
                id: `${Date.now()}_${index}`,
            }

            state.profiles.push(newProfile)

            if (imported === 0) {
                firstProfileId = newProfile.id
            }

            imported++
        } else if (line.trim()) {
            // Добавляем строку в ошибки для отладки
            errors.push(`Строка ${index + 1}: "${line.trim()}"`)
            skipped++
        }
    }

    if (imported > 0) {
        saveProfiles()
        renderProfiles()
        hideImportForm()

        let message = `Импортировано: ${imported}`
        if (skipped > 0) {
            message += `\nПропущено: ${skipped}`
        }
        message += '\n\nАктивировать первый импортированный профиль?'

        showConfirmDialog(message, () => {
            if (firstProfileId) {
                activateProfile(firstProfileId)
            }
        })
    } else {
        let errorMessage = 'Не удалось импортировать ни одного профиля. Проверьте формат данных.'
        
        if (errors.length > 0) {
            errorMessage += '\n\nНераспознанные строки:\n' + errors.slice(0, 5).join('\n')
            if (errors.length > 5) {
                errorMessage += `\n... и ещё ${errors.length - 5} строк`
            }
        }
        
        showConfirmDialog(errorMessage)
    }
}

// Экспорт профилей
function exportProfiles() {
    if (state.profiles.length === 0) {
        showConfirmDialog('Нет профилей для экспорта')
        return
    }

    let exportText = ''
    state.profiles.forEach((profile) => {
        let line = `${profile.name};`

        if (profile.type && profile.type !== 'http') {
            line += `${profile.type.toUpperCase()} `
        }

        if (profile.username && profile.password) {
            line += `${profile.username}:${profile.password}@${profile.host}:${profile.port}`
        } else {
            line += `${profile.host}:${profile.port}`
        }

        exportText += line + '\n'
    })

    const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `proxy-profiles-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    showToast(`Экспортировано ${state.profiles.length} профилей`)
}

// Открытие в боковой панели
function openInSidePanel() {
    chrome.windows.getCurrent((currentWindow) => {
        chrome.runtime.sendMessage({ action: 'openSidePanel', windowId: currentWindow.id }, (response) => {
            if (response?.success) {
                // Закрываем popup правильным способом
                if (chrome.extension.getViews({ type: 'popup' }).length > 0) {
                    chrome.extension.getViews({ type: 'popup' })[0].close()
                }
            } else {
                console.error('Ошибка открытия боковой панели:', response?.error)
                showToast('Ошибка открытия боковой панели')
            }
        })
    })
}

// Модальное окно подтверждения
function showConfirmDialog(message, callback = null) {
    elements.confirmMessage.textContent = message
    state.confirmCallback = callback
    elements.confirmModal.classList.remove('hidden')

    if (callback) {
        elements.confirmYes.style.display = 'inline-flex'
        elements.confirmNo.textContent = 'Нет'
        elements.confirmYes.textContent = 'Да'
    } else {
        elements.confirmYes.style.display = 'inline-flex'
        elements.confirmNo.style.display = 'none'
        elements.confirmYes.textContent = 'ОК'
    }
}

function handleConfirmYes() {
    elements.confirmModal.classList.add('hidden')
    if (state.confirmCallback) {
        state.confirmCallback()
        state.confirmCallback = null
    }
    resetConfirmModal()
}

function handleConfirmNo() {
    elements.confirmModal.classList.add('hidden')
    state.confirmCallback = null
    resetConfirmModal()
}

function resetConfirmModal() {
    elements.confirmYes.textContent = 'Да'
    elements.confirmNo.textContent = 'Нет'
    elements.confirmYes.style.display = 'inline-flex'
    elements.confirmNo.style.display = 'inline-flex'
}

// Уведомления (toast)
function showToast(message, type = 'success') {
    const toast = document.createElement('div')
    const backgroundColor = type === 'error' ? '#ef4444' : 'var(--success)'
    
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${backgroundColor};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 2000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        animation: slideDown 0.3s ease-out;
    `
    toast.textContent = message

    document.body.appendChild(toast)

    const duration = type === 'error' ? 4000 : 2500
    
    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s ease-out forwards'
        setTimeout(() => {
            if (toast.parentNode) {
                document.body.removeChild(toast)
            }
        }, 300)
    }, duration)
}

// Экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

// Обработка сообщений от background скрипта
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'proxyError') {
        showConfirmDialog(`Ошибка прокси:\n${message.error}`)
    } else if (message.action === 'proxyConnectionError') {
        // Показываем ошибку подключения, но не сбрасываем статус
        showToast(`⚠️ Ошибка подключения: ${message.error}`, 'error')
        console.error('Ошибка подключения к прокси:', message.error)
    }
})

// Стили для кнопки отладки
const debugStyles = document.createElement('style')
debugStyles.textContent = `
    .debug-btn {
        padding: 6px;
        border: none;
        background: var(--secondary);
        color: var(--text-secondary);
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        margin-right: 8px;
    }
    
    .debug-btn:hover {
        background: var(--hover-bg);
        color: var(--text-primary);
    }
`
document.head.appendChild(debugStyles)

// Добавляем стили для анимации toast
const style = document.createElement('style')
style.textContent = `
    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }
    
    @keyframes slideUp {
        from {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        to {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
        }
    }
`
document.head.appendChild(style)