// WebRTC блокировщик - предотвращает утечки реального IP
;(function () {
    'use strict'

    let isWebRTCBlocked = false

    // Проверяем настройки блокировки из расширения
    chrome.storage.local.get(['webrtcBlocked'], (result) => {
        isWebRTCBlocked = result.webrtcBlocked !== false // По умолчанию включено
        if (isWebRTCBlocked) {
            console.log('🛡️ WebRTC защита активирована')
            blockWebRTC()
        }
    })

    // Слушаем изменения настроек
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.webrtcBlocked) {
            isWebRTCBlocked = changes.webrtcBlocked.newValue
            if (isWebRTCBlocked) {
                console.log('🛡️ WebRTC защита включена')
                blockWebRTC()
            } else {
                console.log('🔓 WebRTC защита отключена')
                // Перезагружаем страницу для восстановления WebRTC
                window.location.reload()
            }
        }
    })

    function blockWebRTC() {
        // Блокируем RTCPeerConnection
        if (window.RTCPeerConnection) {
            window.RTCPeerConnection = function () {
                throw new Error('RTCPeerConnection заблокирован для защиты приватности')
            }
        }

        if (window.webkitRTCPeerConnection) {
            window.webkitRTCPeerConnection = function () {
                throw new Error('webkitRTCPeerConnection заблокирован для защиты приватности')
            }
        }

        if (window.mozRTCPeerConnection) {
            window.mozRTCPeerConnection = function () {
                throw new Error('mozRTCPeerConnection заблокирован для защиты приватности')
            }
        }

        // Блокируем getUserMedia
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia = function () {
                return Promise.reject(new Error('getUserMedia заблокирован для защиты приватности'))
            }
        }

        if (navigator.getUserMedia) {
            navigator.getUserMedia = function () {
                throw new Error('getUserMedia заблокирован для защиты приватности')
            }
        }

        if (navigator.webkitGetUserMedia) {
            navigator.webkitGetUserMedia = function () {
                throw new Error('webkitGetUserMedia заблокирован для защиты приватности')
            }
        }

        if (navigator.mozGetUserMedia) {
            navigator.mozGetUserMedia = function () {
                throw new Error('mozGetUserMedia заблокирован для защиты приватности')
            }
        }

        // Блокируем enumerateDevices
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            navigator.mediaDevices.enumerateDevices = function () {
                return Promise.resolve([])
            }
        }

        // Удаляем конструкторы из window
        delete window.RTCPeerConnection
        delete window.webkitRTCPeerConnection
        delete window.mozRTCPeerConnection
        delete window.RTCSessionDescription
        delete window.RTCIceCandidate
        delete window.webkitRTCSessionDescription
        delete window.webkitRTCIceCandidate

        console.log('✅ WebRTC API заблокированы')
    }
})()
