// Элементы DOM
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

    // Обработчики модального окна
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) handleConfirmNo()
    })

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!confirmModal.classList.contains('hidden')) {
                handleConfirmNo()
            } else if (!profileForm.classList.contains('hidden')) {
                hideProfileForm()
            } else if (!importForm.classList.contains('hidden')) {
                hideImportForm()
            }
        }
    })
})

// Загрузка профилей
function loadProfiles() {
    chrome.storage.local.get(['profiles', 'activeProfileId'], (result) => {
        profiles = result.profiles || []
        activeProfileId = result.activeProfileId || null
        renderProfiles()
        updateDisableButton()
    })
}

// Сохранение профилей
function saveProfiles() {
    chrome.storage.local.set({ profiles, activeProfileId })
}

// Обновление статуса
function updateStatus() {
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
        const statusText = statusIndicator.querySelector('.status-text')

        if (response && response.isActive && response.currentProfile) {
            statusIndicator.classList.add('active')
            statusText.textContent = `Подключено: ${response.currentProfile.name}`
            activeProfileId = response.currentProfile.id
            quickDisableBtn.classList.remove('hidden')
        } else {
            statusIndicator.classList.remove('active')
            statusText.textContent = 'Прямое подключение'
            activeProfileId = null
            quickDisableBtn.classList.add('hidden')
        }

        updateDisableButton()
        renderProfiles()
    })
}

// Обновление кнопки отключения
function updateDisableButton() {
    const bottomSection = document.querySelector('.bottom-section')
    bottomSection.style.display = activeProfileId ? 'block' : 'none'
}

// Отображение профилей
function renderProfiles() {
    profilesList.innerHTML = ''

    const profilesCount = document.getElementById('profilesCount')
    profilesCount.textContent = profiles.length > 0 ? `${profiles.length}` : ''

    if (profiles.length === 0) {
        profilesList.innerHTML = '<div class="empty-message">Нет сохраненных профилей</div>'
        document.querySelector('.profiles-hint').style.display = 'none'
        return
    }

    document.querySelector('.profiles-hint').style.display = 'block'

    profiles
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((profile) => {
            const profileItem = document.createElement('div')
            profileItem.className = 'profile-item'
            profileItem.dataset.id = profile.id

            if (profile.id === activeProfileId) {
                profileItem.classList.add('active')
            }

            profileItem.innerHTML = `
            <div class="profile-info">
                <div class="profile-name">${escapeHtml(profile.name)}</div>
                <div class="profile-details">
                    <span class="profile-type">${(profile.type || 'HTTP').toUpperCase()}</span>
                    <span>${escapeHtml(profile.host)}:${profile.port}</span>
                    ${profile.username ? '<span class="auth-badge">🔐</span>' : ''}
                </div>
            </div>
            <div class="profile-actions">
                <button class="btn btn-small btn-secondary copy-btn" title="Копировать">📋</button>
                <button class="btn btn-small btn-primary edit-btn" title="Редактировать">✏️</button>
                <button class="btn btn-small btn-danger delete-btn" title="Удалить">🗑️</button>
            </div>
        `

            profileItem.addEventListener('click', (e) => {
                if (!e.target.closest('.profile-actions')) {
                    activateProfile(profile.id)
                }
            })

            profileItem.querySelector('.copy-btn').addEventListener('click', (e) => {
                e.stopPropagation()
                copyProfile(profile)
            })

            profileItem.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation()
                editProfile(profile.id)
            })

            profileItem.querySelector('.delete-btn').addEventListener('click', (e) => {
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

    const profileItem = document.querySelector(`[data-id="${profileId}"]`)
    if (profileItem) profileItem.classList.add('loading')

    chrome.runtime.sendMessage({ action: 'applyProxy', profile }, (response) => {
        if (profileItem) profileItem.classList.remove('loading')

        if (response && response.success) {
            activeProfileId = profileId
            saveProfiles()
            renderProfiles()
            updateStatus()
        }
    })
}

// Отключение прокси
function disableProxy() {
    chrome.runtime.sendMessage({ action: 'disableProxy' }, (response) => {
        if (response && response.success) {
            activeProfileId = null
            saveProfiles()
            renderProfiles()
            updateStatus()
        }
    })
}

// Обработка отключения
function handleDisableProxy() {
    if (activeProfileId) {
        showConfirmDialog('Вы уверены, что хотите отключить прокси?', () => disableProxy())
    } else {
        disableProxy()
    }
}

// Показать форму добавления
function showAddProfileForm() {
    editingProfileId = null
    formTitle.textContent = 'Новый профиль'
    proxyForm.reset()
    document.getElementById('proxyType').value = 'http'
    profileForm.classList.remove('hidden')
    addProfileBtn.style.display = 'none'
    setTimeout(() => document.getElementById('profileName').focus(), 100)
}

// Скрыть форму
function hideProfileForm() {
    profileForm.classList.add('hidden')
    addProfileBtn.style.display = 'block'
    proxyForm.reset()
}

// Копировать профиль
function copyProfile(profile) {
    let text = ''
    if (profile.type && profile.type !== 'http') {
        text += profile.type.toUpperCase() + ' '
    }

    if (profile.username && profile.password) {
        text += `${profile.username}:${profile.password}@${profile.host}:${profile.port}`
    } else {
        text += `${profile.host}:${profile.port}`
    }

    navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector(`.copy-btn[data-id="${profile.id}"]`)
        const originalText = btn.textContent
        btn.textContent = '✓'
        setTimeout(() => (btn.textContent = originalText), 1500)
    })
}

// Редактировать профиль
function editProfile(profileId) {
    const profile = profiles.find((p) => p.id === profileId)
    if (!profile) return

    editingProfileId = profileId
    formTitle.textContent = 'Редактировать профиль'

    document.getElementById('profileName').value = profile.name
    document.getElementById('proxyType').value = profile.type || 'http'
    document.getElementById('proxyHost').value = profile.host
    document.getElementById('proxyPort').value = profile.port
    document.getElementById('proxyUsername').value = profile.username || ''
    document.getElementById('proxyPassword').value = profile.password || ''

    profileForm.classList.remove('hidden')
    addProfileBtn.style.display = 'none'
    setTimeout(() => document.getElementById('profileName').focus(), 100)
}

// Удалить профиль
function deleteProfile(profileId) {
    const profile = profiles.find((p) => p.id === profileId)
    if (!profile) return

    showConfirmDialog(`Удалить профиль "${profile.name}"?`, () => {
        profiles = profiles.filter((p) => p.id !== profileId)
        if (activeProfileId === profileId) disableProxy()
        saveProfiles()
        renderProfiles()
    })
}

// Обработка формы
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

    if (!formData.name || !formData.host || !formData.port) {
        showConfirmDialog('Заполните обязательные поля', null)
        return
    }

    const port = parseInt(formData.port)
    if (isNaN(port) || port < 1 || port > 65535) {
        showConfirmDialog('Порт должен быть от 1 до 65535', null)
        return
    }

    const existingProfile = profiles.find((p) => p.name.toLowerCase() === formData.name.toLowerCase() && p.id !== editingProfileId)
    if (existingProfile) {
        showConfirmDialog('Профиль с таким названием уже существует', null)
        return
    }

    if (editingProfileId) {
        const index = profiles.findIndex((p) => p.id === editingProfileId)
        if (index !== -1) {
            profiles[index] = { ...formData, id: editingProfileId }
            if (editingProfileId === activeProfileId) activateProfile(editingProfileId)
        }
    } else {
        profiles.push({ ...formData, id: Date.now().toString() })
    }

    saveProfiles()
    renderProfiles()
    hideProfileForm()
}

// Парсинг прокси
function parseProxy(line) {
    line = line.trim()
    if (!line) return null

    let customName = null
    let proxyType = 'http'

    // Проверяем название
    const nameMatch = line.match(/^([^:@]+):\s*(.+)$/)
    if (nameMatch && !nameMatch[1].includes('.') && !nameMatch[2].startsWith(nameMatch[1])) {
        customName = nameMatch[1].trim()
        line = nameMatch[2].trim()
    }

    // Проверяем тип
    const typeMatch = line.match(/^(socks5|socks4|http|https)\s+(.+)$/i)
    if (typeMatch) {
        proxyType = typeMatch[1].toLowerCase()
        line = typeMatch[2].trim()
    }

    // Парсим прокси
    let result = null

    // user:pass@ip:port
    const authMatch = line.match(/^([^:@]+):([^:@]+)@([^:]+):(\d+)$/)
    if (authMatch) {
        result = {
            username: authMatch[1],
            password: authMatch[2],
            host: authMatch[3],
            port: authMatch[4],
            type: proxyType,
        }
    }

    // ip:port:user:pass
    if (!result) {
        const colonMatch = line.match(/^([^:]+):(\d+):([^:]+):(.+)$/)
        if (colonMatch) {
            result = {
                host: colonMatch[1],
                port: colonMatch[2],
                username: colonMatch[3],
                password: colonMatch[4],
                type: proxyType,
            }
        }
    }

    // ip:port
    if (!result) {
        const simpleMatch = line.match(/^([^:]+):(\d+)$/)
        if (simpleMatch) {
            result = {
                host: simpleMatch[1],
                port: simpleMatch[2],
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

// Импорт профилей
function processImport() {
    const text = importText.value.trim()
    if (!text) {
        showConfirmDialog('Введите данные прокси', null)
        return
    }

    const lines = text.split('\n')
    let imported = 0
    let skipped = 0
    let firstImportedId = null

    lines.forEach((line, index) => {
        const proxyData = parseProxy(line)
        if (proxyData) {
            const existingProfile = profiles.find((p) => p.host === proxyData.host && p.port === proxyData.port && p.username === proxyData.username)

            if (existingProfile) {
                skipped++
                return
            }

            const newProfile = {
                name: proxyData.customName || `Прокси ${profiles.length + imported + 1}`,
                type: proxyData.type,
                host: proxyData.host,
                port: proxyData.port,
                username: proxyData.username || '',
                password: proxyData.password || '',
                id: Date.now().toString() + index,
            }
            profiles.push(newProfile)

            if (imported === 0) firstImportedId = newProfile.id

            imported++
        } else if (line.trim()) {
            skipped++
        }
    })

    if (imported > 0) {
        saveProfiles()
        renderProfiles()
        hideImportForm()

        let message = `Импортировано: ${imported}`
        if (skipped > 0) message += `\nПропущено: ${skipped}`
        message += '\n\nАктивировать первый?'

        showConfirmDialog(message, () => {
            if (firstImportedId) activateProfile(firstImportedId)
        })
    } else {
        showConfirmDialog('Не удалось импортировать', null)
    }
}

// Экспорт профилей
function exportProfiles() {
    if (profiles.length === 0) {
        showConfirmDialog('Нет профилей для экспорта', null)
        return
    }

    let exportText = ''
    profiles.forEach((profile) => {
        let line = profile.name + ': '

        if (profile.type && profile.type !== 'http') {
            line += profile.type.toUpperCase() + ' '
        }

        if (profile.username && profile.password) {
            line += `${profile.username}:${profile.password}@${profile.host}:${profile.port}`
        } else {
            line += `${profile.host}:${profile.port}`
        }

        exportText += line + '\n'
    })

    const blob = new Blob([exportText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `proxy-export-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    showConfirmDialog(`Экспортировано: ${profiles.length}`, null)
}

// Показать форму импорта
function showImportForm() {
    importForm.classList.remove('hidden')
    addProfileBtn.style.display = 'none'
    setTimeout(() => importText.focus(), 100)
}

// Скрыть форму импорта
function hideImportForm() {
    importForm.classList.add('hidden')
    addProfileBtn.style.display = 'block'
    importText.value = ''
}

// Открыть в боковой панели
function openInSidePanel() {
    chrome.windows.getCurrent((window) => {
        chrome.runtime.sendMessage({ action: 'openSidePanel', windowId: window.id }, () => {
            // Закрываем popup после успешного открытия
            window.close()
        })
    })
}

// Диалог подтверждения
function showConfirmDialog(message, callback = null) {
    confirmMessage.textContent = message
    confirmCallback = callback
    confirmModal.classList.remove('hidden')

    if (!callback) {
        confirmYes.textContent = 'ОК'
        confirmNo.style.display = 'none'
    } else {
        confirmYes.textContent = 'Да'
        confirmNo.style.display = 'block'
    }
}

function handleConfirmYes() {
    confirmModal.classList.add('hidden')
    if (confirmCallback) confirmCallback()
    confirmCallback = null
    confirmYes.textContent = 'Да'
    confirmNo.style.display = 'block'
}

function handleConfirmNo() {
    confirmModal.classList.add('hidden')
    confirmCallback = null
    confirmYes.textContent = 'Да'
    confirmNo.style.display = 'block'
}

// Безопасное экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

// Обработка ошибок
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'proxyError') {
        showConfirmDialog(`Ошибка прокси:\n${message.error}`, null)
    }
})
