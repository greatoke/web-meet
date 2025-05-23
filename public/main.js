const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startCall = document.getElementById('startCall');
const toggleVideo = document.getElementById('toggleVideo');
const toggleAudio = document.getElementById('toggleAudio');
const endCall = document.getElementById('endCall');
const status = document.getElementById('status');
const connectionStatus = document.querySelector('.connection-status');
const cameraSelect = document.getElementById('cameraSelect');
const serverAddress = document.getElementById('serverAddress');
const container = document.querySelector('.container');
const screenShare = document.getElementById('screenShare');
const recordCall = document.getElementById('recordCall');

let localStream, peerConnection;
let isWebSocketReady = false;
let messageQueue = [];
let isInitiator = false;
let isCallStarted = false;
let isVideoEnabled = true;
let isAudioEnabled = true;
let currentCameraId = '';
let isScreenSharing = false;
let originalVideoTrack = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

// Update WebSocket connection to use WSS
const wsProtocol = 'wss:';
const wsHost = window.location.hostname === 'localhost' ? 'localhost:3000' : window.location.host;
const signalingServer = new WebSocket(`${wsProtocol}//${wsHost}`);

// Function to update connection status
function updateConnectionStatus(state) {
    connectionStatus.className = `connection-status ${state}`;
    switch(state) {
        case 'connected':
            connectionStatus.innerHTML = '<i class="fas fa-circle"></i><span>Connected</span>';
            break;
        case 'disconnected':
            connectionStatus.innerHTML = '<i class="fas fa-circle"></i><span>Disconnected</span>';
            break;
        case 'connecting':
            connectionStatus.innerHTML = '<i class="fas fa-circle"></i><span>Connecting...</span>';
            break;
    }
}

// Function to update status message
function updateStatus(message) {
    status.textContent = message;
}

// Function to show/hide loading spinner
function toggleLoading(videoElement, show) {
    const loading = videoElement.parentElement.querySelector('.loading');
    loading.style.display = show ? 'block' : 'none';
}

// Function to safely send messages
function sendSignalingMessage(message) {
  if (isWebSocketReady) {
    console.log('Sending message:', message);
    signalingServer.send(JSON.stringify(message));
  } else {
    console.log('WebSocket not ready, queueing message:', message);
    messageQueue.push(message);
  }
}

// Function to process queued messages
function processMessageQueue() {
  console.log('Processing message queue, length:', messageQueue.length);
  while (messageQueue.length > 0) {
    const message = messageQueue.shift();
    console.log('Sending queued message:', message);
    signalingServer.send(JSON.stringify(message));
  }
}

// Add connection status handling
signalingServer.onopen = () => {
  console.log('WebSocket connection established');
  isWebSocketReady = true;
  startCall.disabled = false;
    updateConnectionStatus('connected');
    updateStatus('Ready to start a call');
  processMessageQueue();
};

signalingServer.onerror = (error) => {
  console.error('WebSocket error:', error);
  isWebSocketReady = false;
    updateConnectionStatus('disconnected');
    updateStatus('Connection error. Please refresh the page.');
  alert('Unable to connect to signaling server. Please ensure the server is running.');
};

signalingServer.onclose = () => {
  console.log('WebSocket connection closed');
  isWebSocketReady = false;
  startCall.disabled = true;
    updateConnectionStatus('disconnected');
    updateStatus('Disconnected from server');
};

const config = { 
  iceServers: [] 
};

// Function to populate camera selection dropdown
async function populateCameraDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        // Clear existing options except the first one
        while (cameraSelect.options.length > 1) {
            cameraSelect.remove(1);
        }

        // Add new options
        videoDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Camera ${cameraSelect.options.length}`;
            cameraSelect.appendChild(option);
        });

        // Enable the select if we have cameras
        cameraSelect.disabled = videoDevices.length === 0;
        
        // If we have cameras and none is selected, select the first one
        if (videoDevices.length > 0 && !currentCameraId) {
            currentCameraId = videoDevices[0].deviceId;
            cameraSelect.value = currentCameraId;
        }
  } catch (error) {
        console.error('Error getting camera devices:', error);
        updateStatus('Error accessing camera devices');
  }
}

// Function to switch camera
async function switchCamera(deviceId) {
    if (!deviceId || deviceId === currentCameraId) return;
    
    try {
        updateStatus('Switching camera...');
        toggleLoading(localVideo, true);

        // Stop current video track
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.stop();
            }
        }

        // Get new stream with selected camera
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: deviceId } },
            audio: isAudioEnabled
        });

        // Update local video
        localVideo.srcObject = newStream;

        // If in a call, update the peer connection
        if (peerConnection) {
            const senders = peerConnection.getSenders();
            const videoSender = senders.find(sender => sender.track.kind === 'video');
            if (videoSender) {
                await videoSender.replaceTrack(newStream.getVideoTracks()[0]);
            }
        }

        // Update local stream
        localStream = newStream;
        currentCameraId = deviceId;
        updateStatus('Camera switched successfully');
  } catch (error) {
        console.error('Error switching camera:', error);
        updateStatus('Error switching camera');
    } finally {
        toggleLoading(localVideo, false);
  }
}

// Add event listener for camera selection
cameraSelect.addEventListener('change', (e) => {
    switchCamera(e.target.value);
});

// Function to toggle video
async function toggleVideoStream() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            isVideoEnabled = videoTrack.enabled;
            toggleVideo.innerHTML = `<i class="fas fa-video${isVideoEnabled ? '' : '-slash'}"></i>`;
        }
    }
}

// Function to toggle audio
async function toggleAudioStream() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            isAudioEnabled = audioTrack.enabled;
            toggleAudio.innerHTML = `<i class="fas fa-microphone${isAudioEnabled ? '' : '-slash'}"></i>`;
        }
  }
}

// Function to end call
function endCallProcess() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    isCallStarted = false;
    
    // Reset UI
    startCall.style.display = 'flex';
    toggleVideo.style.display = 'none';
    toggleAudio.style.display = 'none';
    endCall.style.display = 'none';
    if (screenShare) screenShare.style.display = 'none';
    if (recordCall) recordCall.style.display = 'none';
    updateStatus('Call ended');
}

signalingServer.onmessage = async (message) => {
    console.log('Received message:', message.data);
    const data = JSON.parse(message.data);
    
    if (data.type === 'welcome') {
        // Update server address display
        const serverUrl = `https://${data.serverIP}:${data.serverPort}`;
        serverAddress.textContent = serverUrl;
        serverAddress.title = 'Click to copy';
        
        // Make server address copyable
        serverAddress.style.cursor = 'pointer';
        serverAddress.addEventListener('click', () => {
            navigator.clipboard.writeText(serverUrl).then(() => {
                const originalText = serverAddress.textContent;
                serverAddress.textContent = 'Copied!';
                setTimeout(() => {
                    serverAddress.textContent = originalText;
                }, 2000);
            });
        });
    } else if (data.offer) {
        console.log('Received offer');
        isInitiator = false;
        await createAnswer(data.offer);
    } else if (data.answer) {
        console.log('Received answer');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.iceCandidate) {
        console.log('Received ICE candidate');
        if (peerConnection) {
            try {
                await peerConnection.addIceCandidate(data.iceCandidate);
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        }
    }
};

async function startCallProcess() {
  if (isCallStarted) {
    console.log('Call already started');
    return;
  }
  isCallStarted = true;
    updateStatus('Starting call...');
    toggleLoading(localVideo, true);
    
    try {
        // First, populate camera devices
        await populateCameraDevices();
        
        // Then get media with the selected camera
        console.log('Requesting media with selected camera');
    localStream = await navigator.mediaDevices.getUserMedia({
            video: currentCameraId ? { deviceId: { exact: currentCameraId } } : true,
      audio: true
    });
    console.log('Successfully got media stream');
        toggleLoading(localVideo, false);
  } catch (error) {
    console.error('Error getting media stream:', error);
        toggleLoading(localVideo, false);
    
    try {
      console.log('Trying fallback with video only');
      localStream = await navigator.mediaDevices.getUserMedia({
                video: currentCameraId ? { deviceId: { exact: currentCameraId } } : true,
        audio: false
      });
      console.log('Successfully got video-only stream');
    } catch (error) {
      console.error('Final error getting media stream:', error);
            updateStatus('Error accessing camera');
      alert('Unable to access camera. Please ensure:\n1. Camera permissions are granted\n2. No other app is using the camera\n3. Your camera is enabled\nThen refresh the page and try again.');
      isCallStarted = false;
      return;
    }
  }
  
  localVideo.srcObject = localStream;
  handleOrientation();

  peerConnection = new RTCPeerConnection(config);
  
  // Add connection state change handler
  peerConnection.onconnectionstatechange = () => {
    console.log('Connection state:', peerConnection.connectionState);
        updateStatus(`Connection state: ${peerConnection.connectionState}`);
    if (peerConnection.connectionState === 'connected') {
      console.log('Peers connected!');
            updateStatus('Connected!');
    }
  };
  
  // Add ICE connection state change handler
  peerConnection.oniceconnectionstatechange = () => {
    console.log('ICE connection state:', peerConnection.iceConnectionState);
        updateStatus(`ICE state: ${peerConnection.iceConnectionState}`);
  };
  
  // Add ICE gathering state change handler
  peerConnection.onicegatheringstatechange = () => {
    console.log('ICE gathering state:', peerConnection.iceGatheringState);
    if (peerConnection.iceGatheringState === 'complete') {
      console.log('ICE gathering completed');
    }
  };

  localStream.getTracks().forEach(track => {
    console.log('Adding track to peer connection:', track.kind);
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (e) => {
    console.log('Received remote track:', e.track.kind);
    remoteVideo.srcObject = e.streams[0];
        toggleLoading(remoteVideo, false);
  };
  
  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      console.log('New ICE candidate');
      sendSignalingMessage({ iceCandidate: e.candidate });
    }
  };

    // Show call controls
    startCall.style.display = 'none';
    toggleVideo.style.display = 'flex';
    toggleAudio.style.display = 'flex';
    endCall.style.display = 'flex';
    if (screenShare) screenShare.style.display = 'flex';
    if (recordCall) recordCall.style.display = 'flex';

  if (isInitiator) {
    console.log('Creating offer');
    const offer = await peerConnection.createOffer();
    console.log('Setting local description');
    await peerConnection.setLocalDescription(offer);
    console.log('Sending offer');
    sendSignalingMessage({ offer });
  }
}

startCall.onclick = async () => {
  console.log('Start call button clicked');
  isInitiator = true;
  await startCallProcess();
};

toggleVideo.onclick = toggleVideoStream;
toggleAudio.onclick = toggleAudioStream;
endCall.onclick = endCallProcess;

async function createAnswer(offer) {
  console.log('Creating answer');
  await startCallProcess();
  
  console.log('Setting remote description');
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  console.log('Creating answer');
  const answer = await peerConnection.createAnswer();
  console.log('Setting local description');
  await peerConnection.setLocalDescription(answer);
  console.log('Sending answer');
  sendSignalingMessage({ answer });
}

// Function to handle mobile device orientation
function handleOrientation() {
    if (window.orientation !== undefined) {
        const orientation = window.orientation;
        localVideo.style.transform = `rotate(${orientation}deg)`;
        remoteVideo.style.transform = `rotate(${orientation}deg)`;
    }
}

// Add orientation change listener
window.addEventListener('orientationchange', handleOrientation);

// Splash and landing overlay logic
window.addEventListener('DOMContentLoaded', () => {
  const splashOverlay = document.getElementById('startup-overlay');
  const landingOverlay = document.getElementById('landing-overlay');

  // Show splash, then show landing overlay after splash animation
  if (splashOverlay && landingOverlay) {
    landingOverlay.style.display = 'none';
    setTimeout(() => {
      splashOverlay.classList.add('hide');
      setTimeout(() => {
        splashOverlay.style.display = 'none';
        landingOverlay.style.display = '';
      }, 700);
    }, 2500);
  }

  // Landing overlay logic (unchanged)
  const landingForm = document.getElementById('landing-form');
  const newMeetingBtn = document.getElementById('newMeetingBtn');
  const inviteCodeInput = document.getElementById('inviteCodeInput');

  function goToMeeting(code) {
    // Use URL hash for meeting code
    window.location.hash = `#${code}`;
    landingOverlay.classList.add('hide');
    setTimeout(() => {
      landingOverlay.style.display = 'none';
      if (container) container.style.display = 'block';
    }, 700);
  }

  function generateMeetingCode() {
    // Simple random code, e.g., 6 alphanumeric chars
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  if (newMeetingBtn) {
    newMeetingBtn.addEventListener('click', () => {
      const code = generateMeetingCode();
      goToMeeting(code);
    });
  }

  if (landingForm) {
    landingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = inviteCodeInput.value.trim();
      if (code) {
        goToMeeting(code);
      } else {
        inviteCodeInput.focus();
      }
    });
  }

  // If already in a meeting (URL hash), hide overlay and show app
  if (window.location.hash && window.location.hash.length > 1) {
    landingOverlay.classList.add('hide');
    setTimeout(() => {
      landingOverlay.style.display = 'none';
      if (container) container.style.display = 'block';
    }, 700);
  }
});

if (screenShare) {
  screenShare.addEventListener('click', async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        originalVideoTrack = localStream.getVideoTracks()[0];
        // Replace video track in peer connection
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) await sender.replaceTrack(screenTrack);
        // Update local video
        localVideo.srcObject = screenStream;
        isScreenSharing = true;
        screenShare.title = 'Stop Sharing';
        screenShare.querySelector('i').className = 'fas fa-times-circle';
        // When user stops sharing
        screenTrack.onended = async () => {
          if (originalVideoTrack) {
            if (sender) await sender.replaceTrack(originalVideoTrack);
            localVideo.srcObject = localStream;
            isScreenSharing = false;
            screenShare.title = 'Share Screen';
            screenShare.querySelector('i').className = 'fas fa-desktop';
          }
        };
      } catch (err) {
        console.error('Screen sharing error:', err);
      }
    } else {
      // Stop screen sharing, revert to camera
      const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (originalVideoTrack && sender) {
        await sender.replaceTrack(originalVideoTrack);
        localVideo.srcObject = localStream;
      }
      isScreenSharing = false;
      screenShare.title = 'Share Screen';
      screenShare.querySelector('i').className = 'fas fa-desktop';
    }
  });
}

if (recordCall) {
  recordCall.addEventListener('click', () => {
    if (!isRecording) {
      // Start recording
      let combinedStream;
      if (remoteVideo.srcObject) {
        // Mix local and remote streams
        combinedStream = new MediaStream([
          ...localStream.getTracks(),
          ...remoteVideo.srcObject.getTracks()
        ]);
      } else {
        combinedStream = localStream;
      }
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm; codecs=vp9' });
      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'recording.webm';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);
      };
      mediaRecorder.start();
      isRecording = true;
      recordCall.classList.add('recording');
      recordCall.title = 'Stop Recording';
    } else {
      // Stop recording
      mediaRecorder.stop();
      isRecording = false;
      recordCall.classList.remove('recording');
      recordCall.title = 'Record Call';
    }
  });
}

