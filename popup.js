// Показать диалог подтверждения
function showConfirmDialog(message, callback = null) {
    confirmMessage.textContent = message
    confirmCallback = callback
    confirmModal.classList.remove('hidden')

    // Если нет callback, показываем только кнопку ОК
    if (!callback) {
        confirmYes.textContent = 'ОК'
        confirmNo.style.display = 'none'
    } else {
        confirmYes.textContent = 'Да'
        confirmNo.style.display = 'block'
    }
}

// Обработка подтверждения
function handleConfirmYes() {
    confirmModal.classList.add('hidden')
    if (confirmCallback) {
        confirmCallback()
    }
    confirmCallback = null
    // Восстанавливаем текст кнопок
    confirmYes.textContent = 'Да'
    confirmNo.style.display = 'block'
}

function handleConfirmNo() {
    confirmModal.classList.add('hidden')
    confirmCallback = null
    // Восстанавливаем текст кнопок
    confirmYes.textContent = 'Да'
    confirmNo.style.display = 'block'
}

// Экспорт профилей
function exportProfiles() {
    if (profiles.length === 0) {
        alert('Нет профилей для экспорта')
        return
    }

    let exportText = ''
    profiles.forEach((profile) => {
        let line = ''

        // Добавляем название профиля
        line += profile.name + ': '

        // Добавляем тип если не HTTP
        if (profile.type && profile.type !== 'http') {
            line += profile.type.toUpperCase() + ' '
        }

        // Формат user:pass@ip:port или ip:port
        if (profile.username && profile.password) {
            line += `${profile.username}:${profile.password}@${profile.host}:${profile.port}`
        } else {
            line += `${profile.host}:${profile.port}`
        }

        exportText += line + '\n'
    })

    // Создаем и скачиваем файл
    const blob = new Blob([exportText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `proxy-by-last-export-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    // Показываем уведомление
    showConfirmDialog(`Экспортировано профилей: ${profiles.length}\n\nФайл сохранен в папку загрузок.`, null)
}

// Открыть в боковой панели
function openInSidePanel() {
    chrome.windows.getCurrent((window) => {
        chrome.runtime.sendMessage({
            action: 'openSidePanel',
            windowId: window.id,
        })
    })
}

// Открыть на весь экран
function openInFullscreen() {
    chrome.tabs.create({
        url: chrome.runtime.getURL('popup.html'),
    })
} // Элементы DOM
const statusIndicator = document.getElementById('statusIndicator')
const profilesList = document.getElementById('profilesList')
const addProfileBtn = document.getElementById('addProfileBtn')
const profileForm = document.getElementById('profileForm')
const proxyForm = document.getElementById('proxyForm')
const cancelBtn = document.getElementById('cancelBtn')
const disableProxyBtn = document.getElementById('disableProxyBtn')
const quickDisableBtn = document.getElementById('quickDisableBtn')
const formTitle = document.getElementById('formTitle')
const importBtn = document.getElementById('importBtn')
const exportBtn = document.getElementById('exportBtn')
const importForm = document.getElementById('importForm')
const importText = document.getElementById('importText')
const processImportBtn = document.getElementById('processImportBtn')
const cancelImportBtn = document.getElementById('cancelImportBtn')
const confirmModal = document.getElementById('confirmModal')
const confirmMessage = document.getElementById('confirmMessage')
const confirmYes = document.getElementById('confirmYes')
const confirmNo = document.getElementById('confirmNo')
const openSidePanelBtn = document.getElementById('openSidePanelBtn')
const openFullscreenBtn = document.getElementById('openFullscreenBtn')

// Состояние
let profiles = []
let activeProfileId = null
let editingProfileId = null
let confirmCallback = null

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    loadProfiles()
    updateStatus()

    // Обработчики событий
    addProfileBtn.addEventListener('click', showAddProfileForm)
    cancelBtn.addEventListener('click', hideProfileForm)
    proxyForm.addEventListener('submit', handleFormSubmit)
    disableProxyBtn.addEventListener('click', handleDisableProxy)
    quickDisableBtn.addEventListener('click', handleDisableProxy)
    importBtn.addEventListener('click', showImportForm)
    exportBtn.addEventListener('click', exportProfiles)
    processImportBtn.addEventListener('click', processImport)
    cancelImportBtn.addEventListener('click', hideImportForm)
    confirmYes.addEventListener('click', handleConfirmYes)
    confirmNo.addEventListener('click', handleConfirmNo)
    openSidePanelBtn.addEventListener('click', openInSidePanel)
    openFullscreenBtn.addEventListener('click', openInFullscreen)
})

// Обработка сообщений от background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'proxyError') {
        showConfirmDialog(`Ошибка прокси:\n${message.error}`, null)
    }
})

// Обработка отключения прокси
function handleDisableProxy() {
    if (activeProfileId) {
        showConfirmDialog('Вы уверены, что хотите отключить прокси?', () => disableProxy())
    } else {
        disableProxy()
    }
}

// Загрузка профилей из хранилища
function loadProfiles() {
    chrome.storage.local.get(['profiles', 'activeProfileId'], (result) => {
        profiles = result.profiles || []
        activeProfileId = result.activeProfileId || null

        renderProfiles()
        updateDisableButton()
    })
}

// Сохранение профилей в хранилище
function saveProfiles() {
    chrome.storage.local.set({ profiles, activeProfileId })
}

// Обновление кнопки отключения
function updateDisableButton() {
    const bottomSection = document.querySelector('.bottom-section')
    if (activeProfileId) {
        bottomSection.style.display = 'block'
        quickDisableBtn.classList.remove('hidden')
    } else {
        bottomSection.style.display = 'none'
        quickDisableBtn.classList.add('hidden')
    }
}

// Обновление статуса подключения
function updateStatus() {
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
        const statusText = statusIndicator.querySelector('.status-text')

        if (response && response.isActive && response.currentProfile) {
            statusIndicator.classList.add('active')
            statusIndicator.classList.remove('direct')
            statusText.textContent = `Подключено: ${response.currentProfile.name}`
            activeProfileId = response.currentProfile.id
            quickDisableBtn.classList.remove('hidden')
            updateDisableButton()
        } else {
            statusIndicator.classList.remove('active')
            statusIndicator.classList.add('direct')
            statusText.textContent = 'Прямое подключение'
            activeProfileId = null
            quickDisableBtn.classList.add('hidden')
            updateDisableButton()
        }

        renderProfiles()
    })
}

// Отображение списка профилей
function renderProfiles() {
    profilesList.innerHTML = ''

    // Обновляем счетчик профилей
    const profilesCount = document.getElementById('profilesCount')
    if (profilesCount) {
        profilesCount.textContent = profiles.length > 0 ? `(${profiles.length})` : ''
    }

    if (profiles.length === 0) {
        profilesList.innerHTML = '<div class="empty-message">Нет сохраненных профилей</div>'
        // Скрываем подсказку когда нет профилей
        const hint = document.querySelector('.profiles-hint')
        if (hint) hint.style.display = 'none'
        return
    }

    // Показываем подсказку когда есть профили
    const hint = document.querySelector('.profiles-hint')
    if (hint) hint.style.display = 'block'

    // Сортируем профили по имени
    const sortedProfiles = [...profiles].sort((a, b) => a.name.localeCompare(b.name))

    sortedProfiles.forEach((profile) => {
        const profileItem = document.createElement('div')
        profileItem.className = 'profile-item'
        profileItem.dataset.id = profile.id

        if (profile.id === activeProfileId) {
            profileItem.classList.add('active')
        }

        profileItem.innerHTML = `
        <div class="profile-info">
          <div class="profile-name">${profile.name}</div>
          <div class="profile-details">
            <span class="profile-type">${(profile.type || 'HTTP').toUpperCase()}</span>
            ${profile.host}:${profile.port}
            ${profile.username ? '<span class="auth-badge">🔐</span>' : ''}
          </div>
        </div>
        <div class="profile-actions">
          <button class="btn btn-small btn-secondary copy-btn" data-id="${profile.id}" title="Копировать">📋</button>
          <button class="btn btn-small btn-primary edit-btn" data-id="${profile.id}">✏️</button>
          <button class="btn btn-small btn-danger delete-btn" data-id="${profile.id}">🗑️</button>
        </div>
      `

        // Обработчик клика на весь элемент профиля
        profileItem.addEventListener('click', (e) => {
            // Проверяем, что клик не был на кнопках действий
            if (!e.target.closest('.profile-actions')) {
                activateProfile(profile.id)
            }
        })

        const copyBtn = profileItem.querySelector('.copy-btn')
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            copyProfile(profile)
        })

        const editBtn = profileItem.querySelector('.edit-btn')
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            editProfile(profile.id)
        })

        const deleteBtn = profileItem.querySelector('.delete-btn')
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            deleteProfile(profile.id)
        })

        profilesList.appendChild(profileItem)
    })
}

// Активация профиля
function activateProfile(profileId) {
    const profile = profiles.find((p) => p.id === profileId)
    if (!profile) return

    // Показываем индикатор загрузки
    const profileItem = document.querySelector(`[data-id="${profileId}"]`)
    if (profileItem) {
        profileItem.style.opacity = '0.6'
        profileItem.style.pointerEvents = 'none'
    }

    chrome.runtime.sendMessage(
        {
            action: 'applyProxy',
            profile: profile,
        },
        (response) => {
            if (response && response.success) {
                activeProfileId = profileId
                saveProfiles()
                renderProfiles()
                updateStatus()
                updateDisableButton()
            } else {
                // В случае ошибки восстанавливаем элемент
                if (profileItem) {
                    profileItem.style.opacity = '1'
                    profileItem.style.pointerEvents = 'auto'
                }

                // Проверяем последнюю ошибку
                if (chrome.runtime.lastError) {
                    showConfirmDialog(`Не удалось активировать прокси:\n${chrome.runtime.lastError.message}`, null)
                }
            }
        }
    )
}

// Отключение прокси
function disableProxy() {
    chrome.runtime.sendMessage({ action: 'disableProxy' }, (response) => {
        if (response && response.success) {
            activeProfileId = null
            saveProfiles()
            renderProfiles()
            updateStatus()
            updateDisableButton()
        }
    })
}

// Показать форму добавления профиля
function showAddProfileForm() {
    editingProfileId = null
    formTitle.textContent = 'Новый профиль'
    proxyForm.reset()
    // Устанавливаем значение по умолчанию для типа прокси
    document.getElementById('proxyType').value = 'http'
    profileForm.classList.remove('hidden')
    addProfileBtn.style.display = 'none'
}

// Скрыть форму
function hideProfileForm() {
    profileForm.classList.add('hidden')
    addProfileBtn.style.display = 'block'
    proxyForm.reset()
}

// Копирование профиля в буфер обмена
function copyProfile(profile) {
    let text = ''

    // Добавляем тип если не HTTP
    if (profile.type && profile.type !== 'http') {
        text += profile.type.toUpperCase() + ' '
    }

    if (profile.username && profile.password) {
        text += `${profile.username}:${profile.password}@${profile.host}:${profile.port}`
    } else {
        text += `${profile.host}:${profile.port}`
    }

    navigator.clipboard
        .writeText(text)
        .then(() => {
            // Показываем временное уведомление
            const btn = document.querySelector(`.copy-btn[data-id="${profile.id}"]`)
            const originalText = btn.textContent
            btn.textContent = '✓'
            btn.style.background = 'var(--success-color)'
            btn.style.color = 'white'

            setTimeout(() => {
                btn.textContent = originalText
                btn.style.background = ''
                btn.style.color = ''
            }, 1000)
        })
        .catch((err) => {
            console.error('Ошибка копирования:', err)
            alert('Не удалось скопировать в буфер обмена')
        })
}

// Редактирование профиля
function editProfile(profileId) {
    const profile = profiles.find((p) => p.id === profileId)
    if (!profile) return

    editingProfileId = profileId
    formTitle.textContent = 'Редактировать профиль'

    // Заполнение формы
    document.getElementById('profileName').value = profile.name
    document.getElementById('proxyType').value = profile.type || 'http'
    document.getElementById('proxyHost').value = profile.host
    document.getElementById('proxyPort').value = profile.port
    document.getElementById('proxyUsername').value = profile.username || ''
    document.getElementById('proxyPassword').value = profile.password || ''

    profileForm.classList.remove('hidden')
    addProfileBtn.style.display = 'none'
}

// Удаление профиля
function deleteProfile(profileId) {
    showConfirmDialog('Удалить этот профиль?', () => {
        profiles = profiles.filter((p) => p.id !== profileId)

        if (activeProfileId === profileId) {
            disableProxy()
        }

        saveProfiles()
        renderProfiles()
    })
}

// Обработка отправки формы
function handleFormSubmit(e) {
    e.preventDefault()

    const formData = {
        name: document.getElementById('profileName').value.trim(),
        type: document.getElementById('proxyType').value,
        host: document.getElementById('proxyHost').value.trim(),
        port: document.getElementById('proxyPort').value.trim(),
        username: document.getElementById('proxyUsername').value.trim(),
        password: document.getElementById('proxyPassword').value.trim(),
    }

    // Валидация данных
    if (!formData.name || !formData.host || !formData.port) {
        alert('Пожалуйста, заполните обязательные поля')
        return
    }

    // Проверка порта
    const port = parseInt(formData.port)
    if (isNaN(port) || port < 1 || port > 65535) {
        alert('Порт должен быть числом от 1 до 65535')
        return
    }

    // Проверка IP адреса или домена
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/
    const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/

    if (!ipPattern.test(formData.host) && !domainPattern.test(formData.host)) {
        alert('Введите корректный IP адрес или доменное имя')
        return
    }

    if (editingProfileId) {
        // Обновление существующего профиля
        const index = profiles.findIndex((p) => p.id === editingProfileId)
        if (index !== -1) {
            profiles[index] = { ...formData, id: editingProfileId }

            // Если редактируем активный профиль, применяем изменения
            if (editingProfileId === activeProfileId) {
                activateProfile(editingProfileId)
            }
        }
    } else {
        // Создание нового профиля
        const newProfile = {
            ...formData,
            id: Date.now().toString(),
        }
        profiles.push(newProfile)
    }

    saveProfiles()
    renderProfiles()
    hideProfileForm()
}

// Показать форму импорта
function showImportForm() {
    importForm.classList.remove('hidden')
    addProfileBtn.style.display = 'none'
}

// Скрыть форму импорта
function hideImportForm() {
    importForm.classList.add('hidden')
    addProfileBtn.style.display = 'block'
    importText.value = ''
}

// Парсинг прокси из разных форматов
function parseProxy(line) {
    line = line.trim()
    if (!line) return null

    // Проверяем, есть ли название в начале строки (формат: "Название: прокси")
    let customName = null
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
        const beforeColon = line.substring(0, colonIndex)
        // Проверяем, что это не IP адрес и не содержит @ (часть user:pass@)
        if ((!beforeColon.match(/^\d+\.\d+\.\d+\.\d+$/) && !line.includes('@')) || line.indexOf('@') > colonIndex) {
            // Проверяем что после двоеточия есть еще минимум одно двоеточие (для полного формата прокси)
            const afterColon = line.substring(colonIndex + 1)
            if (afterColon.includes(':')) {
                customName = beforeColon.trim()
                line = afterColon.trim()
            }
        }
    }

    // Паттерны для разных форматов
    const patterns = [
        // user:pass@ip:port
        /^([^:]+):([^@]+)@([^:]+):(\d+)$/,
        // ip:port:user:pass
        /^([^:]+):(\d+):([^:]+):(.+)$/,
        // user:pass:ip:port
        /^([^:]+):([^:]+):([^:]+):(\d+)$/,
        // ip:port (без авторизации)
        /^([^:]+):(\d+)$/,
    ]

    let result = null

    // user:pass@ip:port
    let match = line.match(patterns[0])
    if (match) {
        result = {
            username: match[1],
            password: match[2],
            host: match[3],
            port: match[4],
        }
    }

    // ip:port:user:pass
    if (!result) {
        match = line.match(patterns[1])
        if (match && !isNaN(match[2])) {
            result = {
                host: match[1],
                port: match[2],
                username: match[3],
                password: match[4],
            }
        }
    }

    // user:pass:ip:port
    if (!result) {
        match = line.match(patterns[2])
        if (match && !isNaN(match[4])) {
            result = {
                username: match[1],
                password: match[2],
                host: match[3],
                port: match[4],
            }
        }
    }

    // ip:port (без авторизации)
    if (!result) {
        match = line.match(patterns[3])
        if (match) {
            result = {
                host: match[1],
                port: match[2],
                username: '',
                password: '',
            }
        }
    }

    // Добавляем кастомное название, если оно есть
    if (result && customName) {
        result.customName = customName
    }

    return result
}

// Обработка импорта
function processImport() {
    const text = importText.value.trim()
    if (!text) return

    const lines = text.split('\n')
    let imported = 0
    let firstImportedId = null

    lines.forEach((line, index) => {
        const proxyData = parseProxy(line)
        if (proxyData) {
            const newProfile = {
                name: proxyData.customName || `Прокси ${profiles.length + imported + 1}`,
                type: proxyData.type || 'http',
                host: proxyData.host,
                port: proxyData.port,
                username: proxyData.username,
                password: proxyData.password,
                id: Date.now().toString() + index,
            }
            profiles.push(newProfile)

            // Запоминаем ID первого импортированного профиля
            if (imported === 0) {
                firstImportedId = newProfile.id
            }

            imported++
        }
    })

    if (imported > 0) {
        saveProfiles()
        renderProfiles()
        hideImportForm()

        // Показываем сообщение об успехе
        showConfirmDialog(`Успешно импортировано профилей: ${imported}\n\nАктивировать первый импортированный профиль?`, () => {
            if (firstImportedId) {
                activateProfile(firstImportedId)
            }
        })
    } else {
        alert('Не удалось распознать ни одного прокси. Проверьте формат.')
    }
}
