// Элементы DOM
const statusIndicator = document.getElementById('statusIndicator')
const profilesList = document.getElementById('profilesList')
const addProfileBtn = document.getElementById('addProfileBtn')
const profileForm = document.getElementById('profileForm')
const proxyForm = document.getElementById('proxyForm')
const cancelBtn = document.getElementById('cancelBtn')
const disableProxyBtn = document.getElementById('disableProxyBtn')
const quickDisableBtn = document.getElementById('quickDisableBtn')
const directConnectionBtn = document.getElementById('directConnectionBtn')
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
    directConnectionBtn.addEventListener('click', handleDisableProxy)
    importBtn.addEventListener('click', showImportForm)
    exportBtn.addEventListener('click', exportProfiles)
    processImportBtn.addEventListener('click', processImport)
    cancelImportBtn.addEventListener('click', hideImportForm)
    confirmYes.addEventListener('click', handleConfirmYes)
    confirmNo.addEventListener('click', handleConfirmNo)
    openSidePanelBtn.addEventListener('click', openInSidePanel)

    // Закрытие модальных/форм по клику вне
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) handleConfirmNo()
    })
    // По Esc
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
    chrome.storage.local.get(['profiles', 'activeProfileId'], (res) => {
        profiles = res.profiles || []
        activeProfileId = res.activeProfileId || null
        renderProfiles()
        updateDisableButton()
    })
}

// Сохранение
function saveProfiles() {
    chrome.storage.local.set({ profiles, activeProfileId })
}

// Обновить индикатор
function updateStatus() {
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
        const statusText = statusIndicator.querySelector('.status-text')
        if (response && response.isActive && response.currentProfile) {
            statusIndicator.classList.add('active')
            statusText.textContent = `Подключено: ${response.currentProfile.name}`
            activeProfileId = response.currentProfile.id
            quickDisableBtn.classList.remove('hidden')
            directConnectionBtn.classList.add('hidden')
        } else {
            statusIndicator.classList.remove('active')
            statusText.textContent = 'Прямое подключение'
            activeProfileId = null
            quickDisableBtn.classList.add('hidden')
            directConnectionBtn.classList.remove('hidden')
        }
        updateDisableButton()
        renderProfiles()
    })
}

// Показать/скрыть кнопку отключения
function updateDisableButton() {
    document.querySelector('.bottom-section').style.display = activeProfileId ? 'block' : 'none'
}

// Отрисовать список профилей
function renderProfiles() {
    profilesList.innerHTML = ''
    const count = document.getElementById('profilesCount')
    count.textContent = profiles.length ? `${profiles.length}` : ''
    if (!profiles.length) {
        profilesList.innerHTML = '<div class="empty-message">Нет сохраненных профилей</div>'
        document.querySelector('.profiles-hint').style.display = 'none'
        return
    }
    document.querySelector('.profiles-hint').style.display = 'block'
    profiles
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((p) => {
            const item = document.createElement('div')
            item.className = 'profile-item'
            item.dataset.id = p.id
            if (p.id === activeProfileId) item.classList.add('active')
            item.innerHTML = `
                <div class="profile-info">
                    <div class="profile-name">${escapeHtml(p.name)}</div>
                    <div class="profile-details">
                        <span class="profile-type">${(p.type || 'http').toUpperCase()}</span>
                        <span>${escapeHtml(p.host)}:${p.port}</span>
                        ${p.username ? '<span class="auth-badge">🔐</span>' : ''}
                    </div>
                </div>
                <div class="profile-actions">
                    <button class="btn btn-small btn-secondary copy-btn" title="Копировать">📋</button>
                    <button class="btn btn-small btn-primary edit-btn" title="Редактировать">✏️</button>
                    <button class="btn btn-small btn-danger delete-btn" title="Удалить">🗑️</button>
                </div>`
            // События
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.profile-actions')) activateProfile(p.id)
            })
            item.querySelector('.copy-btn').addEventListener('click', (e) => {
                e.stopPropagation()
                copyProfile(p)
            })
            item.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation()
                editProfile(p.id)
            })
            item.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation()
                deleteProfile(p.id)
            })
            profilesList.appendChild(item)
        })
}

// Активация
function activateProfile(id) {
    const p = profiles.find((x) => x.id === id)
    if (!p) return
    const item = document.querySelector(`[data-id="${id}"]`)
    item?.classList.add('loading')
    chrome.runtime.sendMessage({ action: 'applyProxy', profile: p }, (res) => {
        item?.classList.remove('loading')
        if (res?.success) {
            activeProfileId = id
            saveProfiles()
            renderProfiles()
            updateStatus()
        }
    })
}

// Отключение
function disableProxy() {
    chrome.runtime.sendMessage({ action: 'disableProxy' }, (res) => {
        if (res?.success) {
            activeProfileId = null
            saveProfiles()
            renderProfiles()
            updateStatus()
        }
    })
}
function handleDisableProxy() {
    if (activeProfileId) {
        showConfirmDialog('Отключить прокси?', () => disableProxy())
    } else {
        disableProxy()
    }
}

// Добавление/редактирование
function showAddProfileForm() {
    editingProfileId = null
    formTitle.textContent = 'Новый профиль'
    proxyForm.reset()
    document.getElementById('proxyType').value = 'http'
    profileForm.classList.remove('hidden')
    addProfileBtn.style.display = 'none'
    setTimeout(() => document.getElementById('profileName').focus(), 100)
}
function hideProfileForm() {
    profileForm.classList.add('hidden')
    addProfileBtn.style.display = 'block'
    proxyForm.reset()
}

function handleFormSubmit(e) {
    e.preventDefault()
    const data = {
        name: document.getElementById('profileName').value.trim(),
        type: document.getElementById('proxyType').value,
        host: document.getElementById('proxyHost').value.trim(),
        port: document.getElementById('proxyPort').value.trim(),
        username: document.getElementById('proxyUsername').value.trim(),
        password: document.getElementById('proxyPassword').value.trim(),
    }
    if (!data.name || !data.host || !data.port) {
        showConfirmDialog('Заполните обязательные поля', null)
        return
    }
    const portNum = parseInt(data.port)
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        showConfirmDialog('Порт должен быть от 1 до 65535', null)
        return
    }
    const dup = profiles.find((p) => p.name.toLowerCase() === data.name.toLowerCase() && p.id !== editingProfileId)
    if (dup) {
        showConfirmDialog('Профиль с таким именем уже существует', null)
        return
    }
    if (editingProfileId) {
        const idx = profiles.findIndex((p) => p.id === editingProfileId)
        profiles[idx] = { ...data, id: editingProfileId }
        if (editingProfileId === activeProfileId) activateProfile(editingProfileId)
    } else {
        profiles.push({ ...data, id: Date.now().toString() })
    }
    saveProfiles()
    renderProfiles()
    hideProfileForm()
}

function copyProfile(p) {
    let txt = ''
    if (p.type && p.type !== 'http') txt += p.type.toUpperCase() + ' '
    if (p.username && p.password) {
        txt += `${p.username}:${p.password}@${p.host}:${p.port}`
    } else {
        txt += `${p.host}:${p.port}`
    }
    navigator.clipboard.writeText(txt).then(() => {
        const btn = document.querySelector(`.copy-btn[data-id="${p.id}"]`)
        const orig = btn.textContent
        btn.textContent = '✓'
        setTimeout(() => (btn.textContent = orig), 1500)
    })
}

function editProfile(id) {
    const p = profiles.find((x) => x.id === id)
    if (!p) return
    editingProfileId = id
    formTitle.textContent = 'Редактировать профиль'
    document.getElementById('profileName').value = p.name
    document.getElementById('proxyType').value = p.type || 'http'
    document.getElementById('proxyHost').value = p.host
    document.getElementById('proxyPort').value = p.port
    document.getElementById('proxyUsername').value = p.username || ''
    document.getElementById('proxyPassword').value = p.password || ''
    profileForm.classList.remove('hidden')
    addProfileBtn.style.display = 'none'
    setTimeout(() => document.getElementById('profileName').focus(), 100)
}

function deleteProfile(id) {
    const p = profiles.find((x) => x.id === id)
    if (!p) return
    showConfirmDialog(`Удалить профиль "${p.name}"?`, () => {
        profiles = profiles.filter((x) => x.id !== id)
        if (activeProfileId === id) disableProxy()
        saveProfiles()
        renderProfiles()
    })
}

// Разбор строки с прокси
function parseProxy(line) {
    line = line.trim()
    if (!line) return null
    let customName = null
    let proxyType = 'http'

    // только если после двоеточия есть пробел — "Имя: данные"
    const nameMatch = line.match(/^([^:]+):\s+(.+)$/)
    if (nameMatch) {
        customName = nameMatch[1].trim()
        line = nameMatch[2].trim()
    }

    // тип прокси в начале
    const typeMatch = line.match(/^(socks5|socks4|http|https)\s+(.+)$/i)
    if (typeMatch) {
        proxyType = typeMatch[1].toLowerCase()
        line = typeMatch[2].trim()
    }

    let result = null
    // user:pass@host:port
    const auth = line.match(/^([^:@]+):([^:@]+)@([^:@]+):(\d+)$/)
    if (auth) {
        result = {
            username: auth[1],
            password: auth[2],
            host: auth[3],
            port: auth[4],
            type: proxyType,
        }
    }
    // ip:port:user:pass
    if (!result) {
        const cols = line.match(/^([^:]+):(\d+):([^:]+):(.+)$/)
        if (cols) {
            result = {
                host: cols[1],
                port: cols[2],
                username: cols[3],
                password: cols[4],
                type: proxyType,
            }
        }
    }
    // ip:port
    if (!result) {
        const simple = line.match(/^([^:]+):(\d+)$/)
        if (simple) {
            result = {
                host: simple[1],
                port: simple[2],
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

// Импорт
function processImport() {
    const text = importText.value.trim()
    if (!text) {
        showConfirmDialog('Введите данные прокси', null)
        return
    }
    const lines = text.split('\n')
    let imported = 0,
        skipped = 0,
        firstId = null
    lines.forEach((ln, i) => {
        const d = parseProxy(ln)
        if (d) {
            const exists = profiles.some((p) => p.host === d.host && p.port === d.port && p.username === d.username)
            if (exists) {
                skipped++
                return
            }
            const newP = {
                name: d.customName || `Профиль ${profiles.length + imported + 1}`,
                type: d.type,
                host: d.host,
                port: d.port,
                username: d.username || '',
                password: d.password || '',
                id: Date.now().toString() + i,
            }
            profiles.push(newP)
            if (imported === 0) firstId = newP.id
            imported++
        } else if (ln.trim()) {
            skipped++
        }
    })
    if (imported > 0) {
        saveProfiles()
        renderProfiles()
        hideImportForm()
        let msg = `Импортировано: ${imported}` + (skipped ? `\nПропущено: ${skipped}` : '') + '\n\nАктивировать первый?'
        showConfirmDialog(msg, () => firstId && activateProfile(firstId))
    } else {
        showConfirmDialog('Не удалось импортировать', null)
    }
}

// Экспорт
function exportProfiles() {
    if (!profiles.length) {
        showConfirmDialog('Нет профилей для экспорта', null)
        return
    }
    let txt = ''
    profiles.forEach((p) => {
        let line = p.name + ': '
        if (p.type && p.type !== 'http') line += p.type.toUpperCase() + ' '
        if (p.username && p.password) {
            line += `${p.username}:${p.password}@${p.host}:${p.port}`
        } else {
            line += `${p.host}:${p.port}`
        }
        txt += line + '\n'
    })
    const blob = new Blob([txt], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `proxy-export-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    showConfirmDialog(`Экспортировано: ${profiles.length}`, null)
}

// Показ/скрытие форм
function showImportForm() {
    importForm.classList.remove('hidden')
    addProfileBtn.style.display = 'none'
    setTimeout(() => importText.focus(), 100)
}
function hideImportForm() {
    importForm.classList.add('hidden')
    addProfileBtn.style.display = 'block'
    importText.value = ''
}

// Открыть боковую панель и закрыть popup
function openInSidePanel() {
    chrome.windows.getCurrent((win) => {
        chrome.runtime.sendMessage({ action: 'openSidePanel', windowId: win.id }, () => {
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

// HTML-экранирование
function escapeHtml(txt) {
    const d = document.createElement('div')
    d.textContent = txt
    return d.innerHTML
}

// Ошибки от background
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'proxyError') {
        showConfirmDialog(`Ошибка прокси:\n${msg.error}`, null)
    }
})
