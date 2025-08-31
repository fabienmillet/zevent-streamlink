// --- Charge .env AVANT toute lecture de process.env ---
try {
  require('dotenv').config({ path: require('path').join(__dirname, '.env') });
} catch (e) {}
// --- Patch global console.* pour silence total si LOG_LEVEL=silent ---
if ((process.env.LOG_LEVEL || '').toLowerCase() === 'silent') {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}
// --- Logging utilitaire coloré avec niveaux ---
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const LOG_LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
function shouldLog(level) {
  const current = LOG_LEVELS[LOG_LEVEL] ?? 3;
  const wanted = LOG_LEVELS[level];
  return wanted <= current;
}
function logDebug(...args) {
  if (!shouldLog('debug')) return;
  if (LOG_LEVEL === 'silent') return;
  console.log('\x1b[35m[debug]\x1b[0m', ...args);
}
function logInfo(...args) {
  if (!shouldLog('info')) return;
  console.log(...args);
}
function logWarn(...args) {
  if (!shouldLog('warn')) return;
  console.warn(...args);
}
function logError(...args) {
  if (!shouldLog('error')) return;
  console.error(...args);
}
function logAlways(...args) {
  const message = args.map(arg => 
    typeof arg === 'string' ? arg : 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : 
    String(arg)
  ).join(' ') + '\n';
  process.stdout.write(message);
}
function logApi(method, path, status = '', extra = '') {
  if (!shouldLog('debug')) return;
  
  // Skip logging for frequent polling endpoints to reduce noise
  const frequentEndpoints = [
    '/api/streams',
    '/api/zevent-streamers', 
    '/api/zevent-stats'
  ];
  
  // Only log these endpoints occasionally or when there are changes
  if (frequentEndpoints.includes(path)) {
    // Log only every 20th request for these endpoints, and show a summary
    if (!logApi.counter) logApi.counter = {};
    if (!logApi.counter[path]) logApi.counter[path] = 0;
    logApi.counter[path]++;
    
    if (logApi.counter[path] % 20 === 1) {
      // Show summary instead of individual requests
      const colors = { gray: '\x1b[90m', reset: '\x1b[0m', cyan: '\x1b[36m' };
      logDebug(`${colors.gray}[api]${colors.reset} ${colors.cyan}${path}${colors.reset} (${logApi.counter[path]} requests since startup)`);
    }
    return;
  }
  
  const colors = {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    gray: '\x1b[90m',
    magenta: '\x1b[35m',
  };
  let color = colors.cyan;
  if (status >= 400) color = colors.red;
  else if (status >= 300) color = colors.yellow;
  else if (status >= 200) color = colors.green;
  const statusStr = status ? color + status + colors.reset : '';
  const msg = `${colors.gray}[api]${colors.reset} ${colors.magenta}${method}${colors.reset} ${colors.cyan}${path}${colors.reset} ${statusStr} ${extra}`;
  logDebug(msg.trim());
}

// --- OBS WebSocket Configuration ---
const OBSWebSocket = require('obs-websocket-js').default;
const fetch = require('node-fetch');
const obs = new OBSWebSocket();
let isObsConnected = false;
let obsReconnectTimeout = null;

const OBS_CONFIG = {
  url: process.env.OBS_WEBSOCKET_URL || 'ws://localhost:4455',
  password: process.env.OBS_WEBSOCKET_PASSWORD || '',
  enabled: process.env.OBS_WEBSOCKET_ENABLED === 'true',
  reconnectInterval: parseInt(process.env.OBS_WEBSOCKET_RECONNECT_INTERVAL) || 5000,
  maxReconnectAttempts: parseInt(process.env.OBS_WEBSOCKET_MAX_RECONNECT_ATTEMPTS) || 10
};

// Nom de la collection OBS utilisée par l'application ZEvent
const ZEVENT_COLLECTION_NAME = process.env.ZEVENT_COLLECTION_NAME || 'ZEvent';

// --- Utilitaires pour la gestion des noms ---
function normalizeStreamerName(name) {
  // Normalise le nom pour éviter les problèmes de casse
  return name.trim();
}

function getCanonicalStreamerName(stream) {
  // Utilise le nom du stream, mais vérifie la cohérence avec l'URL Twitch
  const twitchUsername = extractTwitchUsername(stream.twitchUrl);
  if (twitchUsername && twitchUsername.toLowerCase() !== stream.name.toLowerCase()) {
    logWarn(`[OBS] Warning: Stream name "${stream.name}" doesn't match Twitch username "${twitchUsername}"`);
  }
  return stream.name;
}

async function diagnoseOBSScenes(streamerName) {
  if (!isObsConnected) {
    logWarn('[OBS] Cannot diagnose: not connected to OBS');
    return;
  }
  
  try {
    logInfo(`[OBS] 🔍 Diagnosing scenes for streamer: ${streamerName}`);
    
    const scenes = await obs.call('GetSceneList');
    logInfo(`[OBS] Found ${scenes.scenes.length} total scenes:`);
    
    scenes.scenes.forEach((scene, index) => {
      logInfo(`[OBS]   ${index + 1}. "${scene.sceneName}"`);
    });
    
    const expectedSceneName = `Stream_${streamerName}`;
    const existingScene = findSceneByStreamerName(scenes.scenes, streamerName);
    
    if (existingScene) {
      logInfo(`[OBS] ✅ Found scene: "${existingScene.sceneName}" (expected: "${expectedSceneName}")`);
      
      // Diagnostic des sources dans la scène
      const sceneItems = await obs.call('GetSceneItemList', { sceneName: existingScene.sceneName });
      logInfo(`[OBS] Sources in scene "${existingScene.sceneName}":`);
      
      sceneItems.sceneItems.forEach((item, index) => {
        logInfo(`[OBS]   ${index + 1}. "${item.sourceName}" (${item.inputKind})`);
      });
    } else {
      logError(`[OBS] ❌ No scene found for streamer: ${streamerName} (expected: "${expectedSceneName}")`);
    }
  } catch (error) {
    logError(`[OBS] Failed to diagnose scenes: ${error.message}`);
  }
}

function findStreamByName(streamerName) {
  // Chercher le stream par correspondance exacte
  let stream = streams.find(s => s.name === streamerName);
  
  // Si pas trouvé, essayer une correspondance insensible à la casse
  if (!stream) {
    stream = streams.find(s => s.name.toLowerCase() === streamerName.toLowerCase());
  }
  
  // Si toujours pas trouvé, chercher dans l'URL Twitch
  if (!stream) {
    stream = streams.find(s => {
      if (s.twitchUrl) {
        const twitchUsername = extractTwitchUsername(s.twitchUrl);
        return twitchUsername && twitchUsername.toLowerCase() === streamerName.toLowerCase();
      }
      return false;
    });
  }
  
  return stream;
}

function findSceneByStreamerName(scenes, streamerName) {
  const expectedSceneName = `Stream_${streamerName}`;
  
  // D'abord essayer une correspondance exacte
  let scene = scenes.find(scene => scene.sceneName === expectedSceneName);
  
  // Si pas trouvé, essayer une correspondance insensible à la casse
  if (!scene) {
    scene = scenes.find(scene => 
      scene.sceneName.toLowerCase() === expectedSceneName.toLowerCase()
    );
  }
  
  // Si toujours pas trouvé, chercher toute scène contenant le nom du streamer
  if (!scene) {
    scene = scenes.find(scene => 
      scene.sceneName.toLowerCase().includes(streamerName.toLowerCase()) &&
      scene.sceneName.toLowerCase().includes('stream')
    );
  }
  
  return scene;
}

function findSourceByStreamerName(sceneItems, streamerName, sourceType = 'Media') {
  const expectedSourceName = `${sourceType}_${streamerName}`;
  
  // D'abord essayer une correspondance exacte
  let item = sceneItems.find(item => item.sourceName === expectedSourceName);
  
  // Si pas trouvé, essayer une correspondance insensible à la casse
  if (!item) {
    item = sceneItems.find(item => 
      item.sourceName.toLowerCase() === expectedSourceName.toLowerCase()
    );
  }
  
  // Si toujours pas trouvé, chercher par nom de streamer et type
  if (!item) {
    item = sceneItems.find(item => 
      item.sourceName.toLowerCase().includes(streamerName.toLowerCase()) &&
      (sourceType === 'Media' ? 
        (item.sourceName.toLowerCase().includes('media') || item.inputKind === 'ffmpeg_source') :
        item.sourceName.toLowerCase().includes(sourceType.toLowerCase()))
    );
  }
  
  return item;
}

let obsReconnectAttempts = 0;

async function connectToOBS() {
  if (!OBS_CONFIG.enabled) {
    logInfo('[OBS] 🔴 OBS WebSocket is disabled in configuration');
    return;
  }

  try {
    logInfo(`[OBS] 🔄 Attempting to connect to ${OBS_CONFIG.url}...`);
    if (OBS_CONFIG.password) {
      logDebug('[OBS] Using password authentication');
    } else {
      logDebug('[OBS] No password configured');
    }
    
    await obs.connect(OBS_CONFIG.url, OBS_CONFIG.password);
    isObsConnected = true;
    obsReconnectAttempts = 0;
    
    logInfo('[OBS] ✅ Successfully connected to OBS WebSocket!');
    logAlways(`\x1b[32m[OBS]\x1b[0m 🎥 OBS WebSocket connection established`);
    
    // Obtenir des informations de base sur OBS
    try {
      const version = await obs.call('GetVersion');
      const currentScene = await obs.call('GetCurrentProgramScene');
      
      logInfo(`[OBS] 📱 OBS Studio version: ${version.obsVersion}`);
      logInfo(`[OBS] 🌐 WebSocket version: ${version.obsWebSocketVersion}`);
      logInfo(`[OBS] 🎬 Current scene: ${currentScene.currentProgramSceneName}`);
      
      const sceneList = await obs.call('GetSceneList');
      const sceneNames = sceneList.scenes.map(scene => scene.sceneName).join(', ');
      if (sceneList.scenes.length <= 3) { // Only log if few scenes, otherwise it's too verbose
        logDebug(`[OBS] 📋 Available scenes: ${sceneNames}`);
      } else {
        logDebug(`[OBS] 📋 Found ${sceneList.scenes.length} scenes in collection`);
      }
      
      await ensureZEventCollection();
      
      await createExistingStreamerScenes();
      
    } catch (e) {
      logWarn('[OBS] ⚠️ Could not get OBS info:', e.message);
    }
    
  } catch (error) {
    isObsConnected = false;
    logError(`[OBS] ❌ Failed to connect: ${error.message}`);
    
    if (obsReconnectAttempts < OBS_CONFIG.maxReconnectAttempts) {
      obsReconnectAttempts++;
      logWarn(`[OBS] 🔄 Reconnecting in ${Math.round(OBS_CONFIG.reconnectInterval/1000)}s (attempt ${obsReconnectAttempts}/${OBS_CONFIG.maxReconnectAttempts})`);
      obsReconnectTimeout = setTimeout(connectToOBS, OBS_CONFIG.reconnectInterval);
    } else {
      logError('[OBS] 🚫 Max reconnection attempts reached. OBS features will be disabled.');
      logAlways(`\x1b[31m[OBS]\x1b[0m 💥 Unable to connect to OBS after ${OBS_CONFIG.maxReconnectAttempts} attempts`);
    }
  }
}

// Événements OBS WebSocket
obs.on('ConnectionClosed', () => {
  isObsConnected = false;
  logWarn('[OBS] 🔌 Connection closed - OBS WebSocket disconnected');
  logAlways(`\x1b[33m[OBS]\x1b[0m 📱 Lost connection to OBS Studio`);
  if (OBS_CONFIG.enabled && obsReconnectAttempts < OBS_CONFIG.maxReconnectAttempts) {
    connectToOBS();
  }
});

obs.on('ConnectionError', (error) => {
  isObsConnected = false;
  logError(`[OBS] ⚡ Connection error: ${error.message}`);
});

obs.on('Identified', () => {
  logInfo('[OBS] 🤝 WebSocket handshake completed - Ready to send commands');
});

obs.on('CurrentProgramSceneChanged', (data) => {
  // Only log scene changes if it's not too frequent
  const now = Date.now();
  if (!obs.lastSceneChangeLog || now - obs.lastSceneChangeLog > 5000) {
    logDebug(`[OBS] 🎬 Scene changed to: ${data.sceneName}`);
    obs.lastSceneChangeLog = now;
  }
});

// Fonctions utilitaires OBS
async function setOBSScene(sceneName) {
  if (!isObsConnected) {
    logWarn('[OBS] ⚠️ Cannot change scene: not connected to OBS');
    return false;
  }
  
  try {
    logDebug(`[OBS] 🎬 Attempting to change scene to: ${sceneName}`);
    await obs.call('SetCurrentProgramScene', { sceneName });
    logInfo(`[OBS] ✅ Scene successfully changed to: ${sceneName}`);
    return true;
  } catch (error) {
    logError(`[OBS] ❌ Failed to change scene to ${sceneName}: ${error.message}`);
    return false;
  }
}

async function setOBSSourceVisible(sourceName, visible) {
  if (!isObsConnected) {
    logWarn('[OBS] ⚠️ Cannot toggle source: not connected to OBS');
    return false;
  }
  
  try {
    logDebug(`[OBS] 👁️ Attempting to ${visible ? 'show' : 'hide'} source: ${sourceName}`);
    await obs.call('SetSceneItemEnabled', { 
      sceneName: await getCurrentOBSScene(),
      sceneItemId: await getSourceId(sourceName),
      sceneItemEnabled: visible 
    });
    logInfo(`[OBS] ✅ Source ${sourceName} ${visible ? 'shown' : 'hidden'} successfully`);
    return true;
  } catch (error) {
    logError(`[OBS] ❌ Failed to toggle source ${sourceName}: ${error.message}`);
    return false;
  }
}

async function getCurrentOBSScene() {
  if (!isObsConnected) return null;
  try {
    const response = await obs.call('GetCurrentProgramScene');
    return response.currentProgramSceneName;
  } catch (error) {
    logError('[OBS] Failed to get current scene:', error.message);
    return null;
  }
}

async function getSourceId(sourceName) {
  if (!isObsConnected) return null;
  try {
    const currentScene = await getCurrentOBSScene();
    const response = await obs.call('GetSceneItemList', { sceneName: currentScene });
    
    // D'abord essayer une correspondance exacte
    let item = response.sceneItems.find(item => item.sourceName === sourceName);
    
    // Si pas trouvé, essayer une correspondance insensible à la casse
    if (!item) {
      item = response.sceneItems.find(item => 
        item.sourceName.toLowerCase() === sourceName.toLowerCase()
      );
    }
    
    // Si toujours pas trouvé, essayer une correspondance partielle
    if (!item) {
      const baseSourceName = sourceName.replace(/^(Stream_|Media_|Chat_)/, '');
      item = response.sceneItems.find(item => 
        item.sourceName.toLowerCase().includes(baseSourceName.toLowerCase()) ||
        baseSourceName.toLowerCase().includes(item.sourceName.toLowerCase())
      );
    }
    
    return item ? item.sceneItemId : null;
  } catch (error) {
    logError(`[OBS] Failed to get source ID for ${sourceName}:`, error.message);
    return null;
  }
}

async function ensureZEventCollection() {
  if (!isObsConnected) {
    logWarn('[OBS] ⚠️ Cannot manage collections: not connected to OBS');
    return false;
  }

  try {
    const collectionsResponse = await obs.call('GetSceneCollectionList');
    const { currentSceneCollectionName, sceneCollections } = collectionsResponse;
    
    logDebug(`[OBS] 📋 Current collection: ${currentSceneCollectionName || '(unnamed)'}`);
    logDebug(`[OBS] � Raw collections data:`, JSON.stringify(sceneCollections, null, 2));
    
    // Handle different OBS response formats
    let collectionNames = [];
    if (Array.isArray(sceneCollections)) {
      // New format: array of strings  
      collectionNames = sceneCollections.filter(name => name && name.trim() !== '');
    } else if (sceneCollections && Array.isArray(sceneCollections)) {
      // Old format: array of objects with sceneCollectionName property
      collectionNames = sceneCollections
        .filter(sc => sc && sc.sceneCollectionName && sc.sceneCollectionName.trim() !== '')
        .map(sc => sc.sceneCollectionName);
    }
    
    logDebug(`[OBS] � Valid collections: ${collectionNames.join(', ') || '(none)'}`);
    
    const zeventExists = collectionNames.includes(ZEVENT_COLLECTION_NAME);
    
    if (zeventExists) {
      if (currentSceneCollectionName !== ZEVENT_COLLECTION_NAME) {
        logInfo(`[OBS] 🔄 Switching to ${ZEVENT_COLLECTION_NAME} collection...`);
        await obs.call('SetCurrentSceneCollection', { sceneCollectionName: ZEVENT_COLLECTION_NAME });
        await new Promise(resolve => setTimeout(resolve, 1000));
        logInfo(`[OBS] ✅ Now using ${ZEVENT_COLLECTION_NAME} collection`);
      } else {
        logInfo(`[OBS] ✅ Already using ${ZEVENT_COLLECTION_NAME} collection`);
      }
    } else {
      logInfo(`[OBS] 🆕 Creating new collection: ${ZEVENT_COLLECTION_NAME}`);
      
      // Check if OBS has collection naming issues
      if (sceneCollections.length > 0 && collectionNames.length === 0) {
        logWarn(`[OBS] 🔧 OBS collections have naming issues - working with current collection`);
        
        // Create a marker scene to identify this session instead of creating a new collection
        try {
          // Check if session marker already exists
          const sceneList = await obs.call('GetSceneList');
          const markerExists = sceneList.scenes.some(scene => scene.sceneName === 'ZEvent_Session_Active');
          
          if (!markerExists) {
            await obs.call('CreateScene', { sceneName: 'ZEvent_Session_Active' });
            logInfo(`[OBS] ✅ Created ZEvent session marker in current collection`);
          } else {
            logInfo(`[OBS] ✅ ZEvent session marker already exists`);
          }
          
          logWarn(`[OBS] ⚠️ Using current collection due to OBS collection naming issues`);
          return true;
        } catch (markerError) {
          logError(`[OBS] ❌ Could not create session marker: ${markerError.message}`);
        }
      }
      
      // Try normal collection creation
      try {
        await obs.call('CreateSceneCollection', { sceneCollectionName: ZEVENT_COLLECTION_NAME });
        await new Promise(resolve => setTimeout(resolve, 1500));
        logInfo(`[OBS] ✅ Created and switched to ${ZEVENT_COLLECTION_NAME} collection`);
      } catch (createError) {
        logError(`[OBS] ❌ Failed to create collection: ${createError.message}`);
        logWarn(`[OBS] ⚠️ Continuing with current collection: ${currentSceneCollectionName || '(unnamed)'}`);
        
        // Create session marker as fallback
        try {
          const sceneList = await obs.call('GetSceneList');
          const markerExists = sceneList.scenes.some(scene => scene.sceneName === 'ZEvent_Session_Active');
          
          if (!markerExists) {
            await obs.call('CreateScene', { sceneName: 'ZEvent_Session_Active' });
            logInfo(`[OBS] ✅ Created ZEvent session marker in current collection`);
          } else {
            logInfo(`[OBS] ✅ ZEvent session marker already exists`);
          }
        } catch (markerError) {
          logDebug(`[OBS] ⚠️ Could not create session marker: ${markerError.message}`);
        }
      }
    }
    
    // Final verification - only log once per session
    try {
      const sceneList = await obs.call('GetSceneList');
      if (!ensureZEventCollection.setupComplete) {
        logDebug(`[OBS] 🔍 Setup complete - ${sceneList.scenes.length} scenes available`);
        ensureZEventCollection.setupComplete = true;
      }
    } catch (debugError) {
      logDebug(`[OBS] ⚠️ Setup verification failed: ${debugError.message}`);
    }
    
    return true;
  } catch (error) {
    logError(`[OBS] ❌ Failed to ensure ZEvent setup: ${error.message}`);
    return false;
  }
}

// Function to diagnose OBS collection issues
async function diagnoseObsCollections() {
  if (!isObsConnected) {
    logWarn('[OBS] ⚠️ Cannot diagnose collections: not connected to OBS');
    return false;
  }

  try {
    logInfo('[OBS] 🔍 Diagnosing OBS collection issues...');
    
    const collectionsResponse = await obs.call('GetSceneCollectionList');
    logInfo(`[OBS] 📊 Diagnosis Results:`);
    logInfo(`[OBS]   • Current collection: "${collectionsResponse.currentSceneCollectionName || '(empty)'}"`);
    logInfo(`[OBS]   • Total collections found: ${collectionsResponse.sceneCollections.length}`);
    
    collectionsResponse.sceneCollections.forEach((collection, index) => {
      const name = collection.sceneCollectionName;
      logInfo(`[OBS]   • Collection ${index + 1}: "${name || '(empty name)'}" (UUID: ${collection.sceneCollectionUuid || 'none'})`);
    });
    
    // Try to create a test collection
    const testName = `DiagTest_${Date.now()}`;
    try {
      await obs.call('CreateSceneCollection', { sceneCollectionName: testName });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const afterTest = await obs.call('GetSceneCollectionList');
      const testFound = afterTest.sceneCollections.some(sc => sc.sceneCollectionName === testName);
      
      if (testFound) {
        logInfo(`[OBS] ✅ Test collection creation successful`);
        
        // Switch back to original collection if possible
        if (collectionsResponse.currentSceneCollectionName) {
          await obs.call('SetCurrentSceneCollection', { 
            sceneCollectionName: collectionsResponse.currentSceneCollectionName 
          });
        }
      } else {
        logWarn(`[OBS] ⚠️ Test collection not found after creation`);
      }
    } catch (testError) {
      logError(`[OBS] ❌ Test collection creation failed: ${testError.message}`);
    }
    
    return true;
  } catch (error) {
    logError(`[OBS] ❌ Collection diagnosis failed: ${error.message}`);
    return false;
  }
}

async function updateMediaSourceBounds(streamerName) {
  if (!isObsConnected) {
    logWarn('[OBS] ⚠️ Cannot update media source bounds: not connected to OBS');
    return false;
  }

  try {
    // Trouver la scène pour ce streamer
    const scenes = await obs.call('GetSceneList');
    const sceneName = `Stream_${streamerName}`;
    const existingScene = scenes.scenes.find(scene => 
      scene.sceneName === sceneName || 
      scene.sceneName.toLowerCase() === sceneName.toLowerCase()
    );
    
    if (!existingScene) {
      logError(`[OBS] Scene for ${streamerName} not found`);
      return false;
    }
    
    const actualSceneName = existingScene.sceneName;
    const sourceName = `Media_${streamerName}`;
    
    // Trouver la source média
    const sceneItems = await obs.call('GetSceneItemList', { sceneName: actualSceneName });
    const mediaItem = sceneItems.sceneItems.find(item => 
      item.sourceName === sourceName || 
      item.sourceName.toLowerCase() === sourceName.toLowerCase() ||
      (item.sourceName.toLowerCase().includes(streamerName.toLowerCase()) && 
       (item.sourceName.toLowerCase().includes('media') || item.inputKind === 'ffmpeg_source'))
    );
    
    if (!mediaItem) {
      logError(`[OBS] Media source for ${streamerName} not found in scene ${actualSceneName}`);
      return false;
    }
    
    // Récupérer la résolution du canvas
    const videoSettings = await obs.call('GetVideoSettings');
    const canvasWidth = videoSettings.baseWidth;
    const canvasHeight = videoSettings.baseHeight;
    
    logInfo(`[OBS] 📐 Updating media source bounds for ${mediaItem.sourceName}`);
    
    // Mettre à jour le transform avec des bounds adaptatives
    await obs.call('SetSceneItemTransform', {
      sceneName: actualSceneName,
      sceneItemId: mediaItem.sceneItemId,
      sceneItemTransform: {
        positionX: 0,
        positionY: 0,
        scaleX: 1.0,
        scaleY: 1.0,
        cropLeft: 0,
        cropTop: 0,
        cropRight: 0,
        cropBottom: 0,
        // Configuration pour éviter le zoom avec les pubs/écrans d'attente
        boundsType: 'OBS_BOUNDS_SCALE_INNER', // Garde les proportions dans les limites
        boundsAlignment: 5, // Centré
        boundsWidth: canvasWidth,
        boundsHeight: canvasHeight
      }
    });
    
    logInfo(`[OBS] ✅ Media source bounds updated for ${mediaItem.sourceName} (${canvasWidth}x${canvasHeight})`);
    return true;
    
  } catch (error) {
    logError(`[OBS] ❌ Failed to update media source bounds for ${streamerName}: ${error.message}`);
    return false;
  }
}

async function createStreamerScene(streamerName, m3u8Url, hardwareDecoding = false) {
  if (!isObsConnected) {
    logWarn('[OBS] ⚠️ Cannot create scene: not connected to OBS');
    return false;
  }

  try {
    const sceneName = `Stream_${streamerName}`;
    
    const scenes = await obs.call('GetSceneList');
    const existingScene = findSceneByStreamerName(scenes.scenes, streamerName);
    
    if (existingScene) {
      logDebug(`[OBS] 🎬 Scene already exists: ${existingScene.sceneName}`);
      await applyHwDecodingPreference(streamerName);
      return true;
    }

    // Utiliser le paramètre hardwareDecoding pour la création initiale, 
    // sinon utiliser la préférence sauvegardée
    const stream = streams.find(s => s.name === streamerName);
    let preferredHwDecoding;
    
    if (stream && stream.hasOwnProperty('hardwareDecoding')) {
      // Utiliser la préférence sauvegardée
      preferredHwDecoding = stream.hardwareDecoding;
    } else {
      // Première création : utiliser le paramètre et le sauvegarder
      preferredHwDecoding = hardwareDecoding;
      setHwDecodingPreference(streamerName, hardwareDecoding);
    }
    
    logInfo(`[OBS] 🎬 Creating scene: ${sceneName} (HW decoding: ${preferredHwDecoding})`);
    await obs.call('CreateScene', { sceneName });

    const sourceName = `Media_${streamerName}`;
    logInfo(`[OBS] 📺 Adding media source: ${sourceName}`);
    
    const inputSettings = {
      input: m3u8Url,
      is_local_file: false,
      hw_decode: preferredHwDecoding,
      clear_on_media_end: false,
      restart_on_activate: false,
      close_when_inactive: false,
      speed_percent: 100,
      color_range: 0,
      linear_alpha: false,
      input_format: '',
      buffering_mb: 16,
      reconnect_delay_sec: 2,
      network_caching_ms: 5000,
      advanced: true
    };
    
    await obs.call('CreateInput', {
      sceneName,
      inputName: sourceName,
      inputKind: 'ffmpeg_source',
      inputSettings
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      const sceneItems = await obs.call('GetSceneItemList', { sceneName });
      const mediaItem = sceneItems.sceneItems.find(item => item.sourceName === sourceName);
      
      if (mediaItem) {
        logDebug(`[OBS] 📐 Configuring media source transform for: ${sourceName}`);
        
        // Récupérer la résolution du canvas pour calculer l'échelle appropriée
        const videoSettings = await obs.call('GetVideoSettings');
        const canvasWidth = videoSettings.baseWidth;
        const canvasHeight = videoSettings.baseHeight;
        
        // Configuration du transform pour éviter les problèmes de zoom avec les pubs/écrans d'attente
        await obs.call('SetSceneItemTransform', {
          sceneName,
          sceneItemId: mediaItem.sceneItemId,
          sceneItemTransform: {
            positionX: 0,
            positionY: 0,
            scaleX: 1.0,
            scaleY: 1.0,
            cropLeft: 0,
            cropTop: 0,
            cropRight: 0,
            cropBottom: 0,
            // Désactiver l'ajustement automatique de la taille pour éviter le zoom
            boundsType: 'OBS_BOUNDS_SCALE_INNER', // Garde les proportions dans les limites
            boundsAlignment: 5, // Centré
            boundsWidth: canvasWidth,
            boundsHeight: canvasHeight
          }
        });
        
        await obs.call('SetSceneItemEnabled', {
          sceneName,
          sceneItemId: mediaItem.sceneItemId,
          sceneItemEnabled: true
        });
        
        logDebug(`[OBS] ✅ Media source configured with adaptive bounds: ${sourceName} (${canvasWidth}x${canvasHeight})`);
      }
    } catch (error) {
      logWarn(`[OBS] Could not configure media source transform: ${error.message}`);
    }

    try {
      await obs.call('SetInputAudioMonitorType', {
        inputName: sourceName,
        monitorType: 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT'
      });
      logDebug(`[OBS] 🔊 Audio monitoring enabled for: ${sourceName}`);
    } catch (error) {
      logDebug(`[OBS] Could not set audio monitoring for ${sourceName}: ${error.message}`);
    }

    logInfo(`[OBS] ✅ Scene created successfully: ${sceneName} with media source`);
    
    // Tester si la source fonctionne
    setTimeout(async () => {
      try {
        const inputStatus = await obs.call('GetInputStatus', { inputName: sourceName });
        logDebug(`[OBS] 📊 Media source status for ${sourceName}:`, {
          active: inputStatus.videoActive,
          showing: inputStatus.videoShowing
        });
      } catch (error) {
        logDebug(`[OBS] Could not get input status for ${sourceName}: ${error.message}`);
      }
    }, 3000);
    
    return true;
  } catch (error) {
    logError(`[OBS] ❌ Failed to create scene for ${streamerName}: ${error.message}`);
    return false;
  }
}

async function deleteStreamerScene(streamerName) {
  if (!isObsConnected) {
    logWarn('[OBS] ⚠️ Cannot delete scene: not connected to OBS');
    return false;
  }

  try {
    const sceneName = `Stream_${streamerName}`;
    
    // Vérifier si la scène existe
    const scenes = await obs.call('GetSceneList');
    const existingScene = findSceneByStreamerName(scenes.scenes, streamerName);
    
    if (!existingScene) {
      logDebug(`[OBS] 🎬 Scene doesn't exist: ${sceneName}`);
      return true;
    }

    const actualSceneName = existingScene.sceneName;

    // Si c'est la scène actuelle, basculer vers une autre scène
    const currentScene = await getCurrentOBSScene();
    if (currentScene === actualSceneName) {
      // Trouver une autre scène vers laquelle basculer
      const otherScenes = scenes.scenes.filter(scene => scene.sceneName !== actualSceneName);
      if (otherScenes.length > 0) {
        const targetScene = otherScenes[0].sceneName;
        logInfo(`[OBS] 🔄 Switching from ${actualSceneName} to ${targetScene} before deletion`);
        await obs.call('SetCurrentProgramScene', { sceneName: targetScene });
        // Attendre un peu pour que le changement soit effectif
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        logWarn(`[OBS] ⚠️ Cannot delete scene ${actualSceneName}: it's the only scene and currently active`);
        return false;
      }
    }

    // Vérification supplémentaire : s'assurer qu'il restera au moins une scène après suppression
    if (scenes.scenes.length <= 1) {
      logWarn(`[OBS] ⚠️ Cannot delete scene ${actualSceneName}: it's the only scene in OBS`);
      return false;
    }

    logInfo(`[OBS] 🗑️ Deleting scene: ${actualSceneName}`);
    await obs.call('RemoveScene', { sceneName: actualSceneName });
    
    logInfo(`[OBS] ✅ Scene deleted successfully: ${sceneName}`);
    return true;
  } catch (error) {
    logError(`[OBS] ❌ Failed to delete scene for ${streamerName}: ${error.message}`);
    return false;
  }
}

async function updateMediaSourceUrl(streamerName, newM3u8Url) {
  if (!isObsConnected) {
    logWarn('[OBS] ⚠️ Cannot update media source: not connected to OBS');
    return false;
  }

  try {
    const sourceName = `Media_${streamerName}`;
    const preferredHwDecoding = getHwDecodingPreference(streamerName);
    
    logInfo(`[OBS] 🔄 Updating media source URL: ${sourceName} (maintaining HW decoding: ${preferredHwDecoding})`);
    await obs.call('SetInputSettings', {
      inputName: sourceName,
      inputSettings: {
        input: newM3u8Url,
        hw_decode: preferredHwDecoding,  // Réappliquer la préférence
        restart_on_activate: false       // Maintenir la case décochée
      }
    });

    logInfo(`[OBS] ✅ Media source updated successfully: ${sourceName}`);
    return true;
  } catch (error) {
    logError(`[OBS] ❌ Failed to update media source for ${streamerName}: ${error.message}`);
    return false;
  }
}

async function toggleHardwareDecoding(streamerName, enabled) {
  if (!isObsConnected) {
    logWarn('[OBS] ⚠️ Cannot toggle hardware decoding: not connected to OBS');
    return false;
  }

  try {
    const sourceName = `Media_${streamerName}`;
    let realSourceName = sourceName;
    
    // Vérifier si la source existe avec le nom attendu
    try {
      await obs.call('GetInputSettings', { inputName: sourceName });
    } catch (sourceError) {
      // Chercher la vraie source dans la scène
      const sceneName = `Stream_${streamerName}`;
      try {
        const scenes = await obs.call('GetSceneList');
        const existingScene = findSceneByStreamerName(scenes.scenes, streamerName);
        
        if (!existingScene) {
          logError(`[OBS] Scene for ${streamerName} not found`);
          return false;
        }
        
        const sceneItems = await obs.call('GetSceneItemList', { sceneName: existingScene.sceneName });
        const mediaItem = findSourceByStreamerName(sceneItems.sceneItems, streamerName, 'Media');
        
        if (mediaItem) {
          realSourceName = mediaItem.sourceName;
        } else {
          logError(`[OBS] No media source found in scene ${existingScene.sceneName} for ${streamerName}`);
          return false;
        }
      } catch (sceneError) {
        logError(`[OBS] Scene for ${streamerName} not found: ${sceneError.message}`);
        return false;
      }
    }
    
    logInfo(`[OBS] ⚙️ ${enabled ? 'Enabling' : 'Disabling'} hardware decoding for: ${realSourceName}`);
    await obs.call('SetInputSettings', {
      inputName: realSourceName,
      inputSettings: {
        hw_decode: enabled
      }
    });

    logInfo(`[OBS] ✅ Hardware decoding ${enabled ? 'enabled' : 'disabled'} for: ${realSourceName}`);
    
    // Sauvegarder la préférence pour ce streamer
    setHwDecodingPreference(streamerName, enabled);
    logInfo(`[OBS] 💾 Saved HW decoding preference for ${streamerName}: ${enabled}`);
    
    return true;
  } catch (error) {
    logError(`[OBS] ❌ Failed to toggle hardware decoding for ${streamerName}: ${error.message}`);
    return false;
  }
}

async function getHardwareDecodingStatus(streamerName) {
  if (!isObsConnected) {
    logWarn('[OBS] ⚠️ Cannot get hardware decoding status: not connected to OBS');
    return false;
  }

  try {
    const sourceName = `Media_${streamerName}`;
    
    // D'abord vérifier si la source existe
    try {
      const settings = await obs.call('GetInputSettings', {
        inputName: sourceName
      });
      return settings.inputSettings.hw_decode || false;
    } catch (sourceError) {
      // La source n'existe pas, chercher dans toutes les scènes
      try {
        const scenes = await obs.call('GetSceneList');
        const existingScene = findSceneByStreamerName(scenes.scenes, streamerName);
        
        if (!existingScene) {
          logDebug(`[OBS] Scene for ${streamerName} not found`);
          return false;
        }
        
        const sceneItems = await obs.call('GetSceneItemList', { sceneName: existingScene.sceneName });
        const mediaItem = findSourceByStreamerName(sceneItems.sceneItems, streamerName, 'Media');
        
        if (mediaItem) {
          // Utiliser le vrai nom de la source
          const realSourceName = mediaItem.sourceName;
          const settings = await obs.call('GetInputSettings', {
            inputName: realSourceName
          });
          return settings.inputSettings.hw_decode || false;
        } else {
          logDebug(`[OBS] No media source found in scene ${existingScene.sceneName} for ${streamerName}`);
          return false;
        }
      } catch (sceneError) {
        // Scene doesn't exist - this is normal after deletion, don't log as error
        logDebug(`[OBS] Scene for ${streamerName} not available (possibly deleted)`);
        return false;
      }
    }
    
    // Si on arrive ici, la source existe avec le nom attendu
    const settings = await obs.call('GetInputSettings', {
      inputName: sourceName
    });

    return settings.inputSettings.hw_decode || false;
  } catch (error) {
    // Only log this occasionally to avoid spam
    if (!getHardwareDecodingStatus.lastErrorLog || Date.now() - getHardwareDecodingStatus.lastErrorLog > 30000) {
      logDebug(`[OBS] Could not get hardware decoding status for ${streamerName}: ${error.message}`);
      getHardwareDecodingStatus.lastErrorLog = Date.now();
    }
    return false;
  }
}

async function toggleChatDisplay(stream, enabled) {
  if (!isObsConnected) {
    logWarn('[OBS] ⚠️ Cannot toggle chat display: not connected to OBS');
    return false;
  }

  try {
    // Trouver la vraie scène pour ce streamer
    const scenes = await obs.call('GetSceneList');
    const existingScene = findSceneByStreamerName(scenes.scenes, stream.name);
    
    if (!existingScene) {
      logError(`[OBS] Scene for ${stream.name} not found`);
      return false;
    }
    
    const sceneName = existingScene.sceneName;
    const mediaSrcName = `Media_${stream.name}`;
    const chatSrcName = `Chat_${stream.name}`;
    
    // Extraire le nom du streamer depuis l'URL Twitch
    const twitchUsername = extractTwitchUsername(stream.twitchUrl);
    if (!twitchUsername) {
      throw new Error('Cannot extract Twitch username from URL');
    }

    if (enabled) {
      // Créer/afficher la source chat
      await createChatSource(sceneName, chatSrcName, twitchUsername);
      // Redimensionner la source média pour faire de la place au chat
      await resizeMediaForChat(sceneName, mediaSrcName, true);
      logInfo(`[OBS] ✅ Chat enabled for ${stream.name}`);
    } else {
      // Supprimer la source chat
      await deleteChatSource(sceneName, chatSrcName);
      // Restaurer la taille de la source média
      await resizeMediaForChat(sceneName, mediaSrcName, false);
      logInfo(`[OBS] ✅ Chat disabled for ${stream.name}`);
    }

    return true;
  } catch (error) {
    logError(`[OBS] ❌ Failed to toggle chat display for ${stream.name}: ${error.message}`);
    return false;
  }
}

async function createChatSource(sceneName, chatSourceName, twitchUsername) {
  try {
    // URL du chat Twitch (popout)
    const chatUrl = `https://www.twitch.tv/embed/${twitchUsername}/chat?parent=localhost`;
    
    // Récupérer la résolution du canvas depuis OBS
    const videoSettings = await obs.call('GetVideoSettings');
    const canvasWidth = videoSettings.baseWidth;
    const canvasHeight = videoSettings.baseHeight;
    
    // Calculer les dimensions du chat adaptatif selon la résolution
    let chatWidth;
    if (canvasWidth >= 1920) {
      // 4K, 1440p, 1080p : 300-350px
      chatWidth = Math.max(300, Math.floor(canvasWidth * 0.18));
    } else if (canvasWidth >= 1280) {
      // 720p : 250-280px (proportion plus importante)
      chatWidth = Math.max(250, Math.floor(canvasWidth * 0.22));
    } else {
      // Résolutions plus faibles : minimum 200px
      chatWidth = Math.max(200, Math.floor(canvasWidth * 0.25));
    }
    
    const chatHeight = canvasHeight;
    
    // Supprimer la source si elle existe déjà pour la recréer proprement
    await deleteChatSource(sceneName, chatSourceName);

    // Créer la source browser pour le chat
    await obs.call('CreateInput', {
      sceneName: sceneName,
      inputName: chatSourceName,
      inputKind: 'browser_source',
        inputSettings: {
          url: chatUrl,
          width: chatWidth,
          height: chatHeight,
          css: `
          /* CSS Variables pour personnalisation facile */
          :root {
              --background-color: rgba(0,0,0,0);
              --text-color: #FFFFFF;
              --username-color: #00ff88;
              --font-size: 14px;
              --line-height: 18px;
              --text-shadow: -1px -1px 1px #000000, -1px 1px 1px #000000, 1px -1px 1px #000000, 1px 1px 1px #000000;
              --margin: 0 auto;
              --overflow: hidden;
          }

          /* Forcer TOUTE la taille de police à 14px */
          *, *::before, *::after {
              font-size: 14px !important;
              line-height: 18px !important;
          }

          /* Masquer COMPLÈTEMENT tous les éléments de réponse */
          [class*="reply" i],
          [class*="Reply" i],
          [data-test-selector*="reply" i],
          [data-a-target*="reply" i],
          [aria-label*="reply" i],
          [aria-label*="répond" i],
          div:contains("Répond à"),
          div:contains("Reply to"),
          span:contains("Répond à"),
          span:contains("Reply to") {
              display: none !important;
              visibility: hidden !important;
              height: 0 !important;
              width: 0 !important;
              overflow: hidden !important;
              position: absolute !important;
              left: -9999px !important;
          }

          /* Masquer spécifiquement les lignes contenant "Répond à" */
          .chat-line__message:has(*:contains("Répond à")),
          .chat-line__message:has(*:contains("Reply to")),
          *:contains("Répond à @"),
          *:contains("Reply to @") {
              display: none !important;
              visibility: hidden !important;
              height: 0 !important;
              opacity: 0 !important;
          }
          
          /* Masquer tous les éléments indésirables de Twitch */
          .ember-chat .chat-room {
              top: 0!important;
          }
          
          .ember-chat .chat-header,
          .room-selector__header,
          .ember-chat .chat-messages .chat-line.admin,
          .stream-chat-header,
          .channel-leaderboard,
          .chat-input,
          .chat-input__buttons-container,
          .community-highlight-stack__card,
          .community-highlight,
          .community-highlight-stack__backlog-card,
          .consent-banner,
          [data-test-selector="channel-leaderboard-container"],
          [data-a-target="chat-welcome-message"],
          [data-a-target="moderation-action"],
          .chat-line__status,
          .channel-leaderboard-header-rotating__users,
          .tw-interactable > *,
          .gift-banner,
          .sub-gift-banner,
          .bits-card,
          .hype-train-card,
          [data-test-selector="hype-train-expanded-chat-message"],
          [data-test-selector="sub-gift-banner"],
          [data-test-selector="gift-banner"],
          .chat-line__message--cheer,
          .chat-line__message--subscription,
          .chat-line__message--sub-gift,
          .chat-line__message--resub,
          .chat-line__message--ritual,
          .chat-line__message--announcement,
          .chat-line__message--highlighted-message,
          [data-test-selector="chat-line-message-highlight"],
          [data-test-selector="chat-line-message-body"] .tw-c-text-alt,
          .chat-line__message-body--highlighted,
          .user-notice-line,
          .chat-line__username-container--highlighted-message,
          [class*="announcement"],
          [class*="subscription"],
          [class*="sub-gift"],
          [class*="resub"],
          [class*="ritual"],
          .chat-line__reply-references,
          .chat-line__reply-references-bar,
          [data-test-selector="chat-reply-thread"],
          [data-a-target="chat-reply"],
          .chat-reply,
          .reply-thread-line,
          .chat-line__message--reply,
          .chat-line__username-container--reply,
          [class*="reply"],
          .chat-line__reply,
          .chat-line__reply-references-content,
          [data-a-target="reply-thread-target-message-username"],
          [data-a-target="reply-thread-target-message"],
          .reply-references,
          .reply-thread,
          .tw-inline-flex.tw-align-items-center,
          button[aria-label*="Répon"],
          button[aria-label*="Reply"],
          [class*="ReplyReferences"],
          [data-test-selector*="reply"] {
              display: none !important;
              visibility: hidden !important;
              height: 0 !important;
              width: 0 !important;
              overflow: hidden !important;
          }
          
          /* Masquer tous les éléments avec "Répond à" dans le texte */
          *:contains("Répond à") {
              display: none !important;
          }
          
          /* Masquer les divs parent qui contiennent des réponses */
          div:has(*:contains("Répond à")),
          .chat-line:has(*:contains("Répond à")) {
              display: none !important;
          }

          /* Masquer certains badges */
          img.chat-badge[alt="Twitch Prime"],
          img.chat-badge[alt="Turbo"],
          img.chat-badge[alt="Verified"] {
              display: none!important;
          }

          /* Masquer les éléments contenant "Répond" ou "Reply" */
          .chat-line__message:has([data-a-target*="reply"]),
          .chat-line__message:contains("Répond à"),
          .chat-line__message:contains("Reply to"),
          *[aria-label*="Répond"],
          *[aria-label*="Reply"] {
              display: none!important;
          }

          /* Configuration générale */
          body {
              color: var(--text-color) !important;
              margin: var(--margin) !important;
              overflow: var(--overflow) !important;
              text-shadow: var(--text-shadow) !important;
          }

          /* Arrière-plans transparents */
          html, body,
          .room-selector, .room-selector__header,
          .twilight-minimal-root, .tw-root--theme-light,
          .popout-chat-page, .chat-room, .tw-c-background-alt,
          .chat-container, .ember-chat-container, .stream-chat-container,
          .first-message-highlight-line,
          .chat-scrollable-area__message-container {
              background: var(--background-color) !important;
              background-color: var(--background-color) !important;
          }

          /* Taille de police */
          html {
              font-size: 100% !important;
          }

          .stream-chat .chat-messages .chat-line, 
          .ember-chat .chat-messages .chat-line {
              font-size: var(--font-size) !important;
              line-height: var(--line-height) !important;
          }

          /* Couleur du texte */
          .chat-container, .ember-chat-container {
              color: var(--text-color) !important;
          }

          /* Messages de chat */
          .chat-line__message {
              color: var(--text-color) !important;
              font-size: var(--font-size) !important;
              text-shadow: var(--text-shadow) !important;
              padding: 2px 4px !important;
              margin: 1px 0 !important;
          }

          /* Éléments de texte spécifiques - sans toucher aux pseudos */
          .text-fragment,
          .chat-line__message-body *:not(.chat-author__display-name),
          div[class*="chat-line"]:not(.chat-author__display-name),
          span[class*="chat-line"]:not(.chat-author__display-name),
          .tw-c-text-alt:not(.chat-author__display-name),
          .tw-c-text-base:not(.chat-author__display-name) {
              color: var(--text-color) !important;
              text-shadow: var(--text-shadow) !important;
              background: transparent !important;
          }

          /* Force pour les contenus de messages uniquement */
          .chat-line__message-body {
              color: white !important;
              background: transparent !important;
          }

          /* Garder les couleurs des pseudos mais ajouter une ombre */
          .chat-author__display-name * {
              text-shadow: var(--text-shadow) !important;
          }

          /* Noms d'utilisateurs - garder leurs couleurs originales avec ombre */
          .chat-author__display-name {
              font-weight: bold !important;
              text-shadow: var(--text-shadow) !important;
              /* Ne pas forcer la couleur, garder les couleurs Twitch */
          }

          /* Messages seulement - forcer en blanc */
          .text-fragment,
          .chat-line__message-body .text-fragment,
          [data-a-target="chat-message-text"] {
              color: var(--text-color) !important;
              text-shadow: var(--text-shadow) !important;
          }

          /* Badges avec ombre */
          .chat-badge {
              filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.8)) !important;
          }

          /* Scrollbar discrète */
          ::-webkit-scrollbar {
              width: 4px !important;
          }

          ::-webkit-scrollbar-track {
              background: transparent !important;
          }

          ::-webkit-scrollbar-thumb {
              background: rgba(255,255,255,0.2) !important;
              border-radius: 2px !important;
          }

          ::-webkit-scrollbar-thumb:hover {
              background: rgba(255,255,255,0.4) !important;
          }

          /* SOLUTION CIBLÉE ANTI-RÉPOND À */
          
          /* Cibler UNIQUEMENT les éléments de réponse spécifiques */
          [class*="reply-line"],
          [class*="parent-message"],
          [class*="reply-bar"],
          [data-test-selector*="reply"],
          .chat-reply,
          .reply-thread {
              font-size: 0 !important;
              height: 0 !important;
              width: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              border: none !important;
              overflow: hidden !important;
              opacity: 0 !important;
              display: none !important;
          }

          /* Solution CSS ultra-directe : tout élément avec "Répond" en taille 0 */
          * {
              /* Vérification par contenu - utilise un hack CSS */
          }
          
          /* Sélecteur spécial pour les éléments contenant "Répond" */
          span:not(.chat-author__display-name):not(.text-fragment),
          div:not(.chat-line__message):not(.chat-line__message-body) {
              /* Si ça contient "Répond", on le cache avec JavaScript */
          }

          /* Cibler les éléments qui commencent spécifiquement par "Répond à" */
          *[title^="Répond à"],
          *[alt^="Répond à"] {
              font-size: 0 !important;
              height: 0 !important;
              display: none !important;
              visibility: hidden !important;
          }

          /* SOLUTION BRUTALE : tout élément dont le premier enfant texte commence par "Répond" */
          *:first-child {
              /* Sera géré par JavaScript */
          }

          /* PRÉSERVER les messages de chat normaux */
          .chat-line__message {
              display: block !important;
              visibility: visible !important;
              opacity: 1 !important;
              font-size: 13px !important;
          }

          /* Assurer que les noms d'utilisateurs restent visibles */
          .chat-author__display-name,
          .chat-author__display-name * {
              font-size: 13px !important;
              font-weight: bold !important;
              display: inline !important;
              visibility: visible !important;
              opacity: 1 !important;
          }

          /* Forcer les messages à être visibles et de taille normale */
          .chat-line__message-body,
          .chat-line__message-body *,
          .text-fragment {
              font-size: 13px !important;
              display: inline !important;
              visibility: visible !important;
              opacity: 1 !important;
          }

          /* Préserver les badges et émotes */
          .chat-badge,
          .chat-image,
          img {
              display: inline !important;
              visibility: visible !important;
              opacity: 1 !important;
          }
        </style>
        
        <script>
        // Solution JavaScript ULTRA-DIRECTE pour "Répond à"
        (function() {
          function hideReplyElements() {
            // Méthode DIRECTE : parcourir TOUS les éléments
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
              null,
              false
            );
            
            const replyTextNodes = [];
            let node;
            
            // Trouver tous les nœuds texte contenant "Répond à"
            while (node = walker.nextNode()) {
              if (node.textContent.includes('Répond à')) {
                replyTextNodes.push(node);
              }
            }
            
            // Pour chaque nœud texte "Répond à", masquer son parent
            replyTextNodes.forEach(textNode => {
              let element = textNode.parentElement;
              
              // Remonter jusqu'à trouver l'élément conteneur de la réponse
              while (element && element !== document.body) {
                const text = element.textContent.trim();
                
                // Si cet élément commence par "Répond à", le masquer
                if (text.startsWith('Répond à ')) {
                  element.style.setProperty('font-size', '0', 'important');
                  element.style.setProperty('height', '0', 'important');
                  element.style.setProperty('overflow', 'hidden', 'important');
                  element.style.setProperty('opacity', '0', 'important');
                  element.style.setProperty('display', 'none', 'important');
                  element.style.setProperty('position', 'absolute', 'important');
                  element.style.setProperty('left', '-9999px', 'important');
                  break;
                }
                element = element.parentElement;
              }
            });
            
            // Méthode 2: Scan direct de tous les éléments
            document.querySelectorAll('*').forEach(el => {
              const text = el.textContent;
              const firstText = el.firstChild ? el.firstChild.textContent : '';
              
              // Si l'élément commence par "Répond à" et n'est pas un message principal
              if ((text && text.trim().startsWith('Répond à ')) || 
                  (firstText && firstText.trim().startsWith('Répond à '))) {
                
                // Vérifier que ce n'est pas dans un message légitime
                const isInMessage = el.closest('.chat-line__message-body') || 
                                   el.closest('.text-fragment') ||
                                   el.classList.contains('chat-author__display-name');
                
                if (!isInMessage) {
                  el.style.setProperty('font-size', '0', 'important');
                  el.style.setProperty('height', '0', 'important');
                  el.style.setProperty('opacity', '0', 'important');
                  el.style.setProperty('display', 'none', 'important');
                  el.style.setProperty('visibility', 'hidden', 'important');
                }
              }
            });

            // Méthode 3: S'assurer que les VRAIS messages restent visibles
            document.querySelectorAll('.chat-line__message').forEach(chatLine => {
              const text = chatLine.textContent || '';
              if (!text.startsWith('Répond à ')) {
                chatLine.style.removeProperty('display');
                chatLine.style.removeProperty('font-size');
                chatLine.style.removeProperty('opacity');
                chatLine.style.setProperty('display', 'block', 'important');
                chatLine.style.setProperty('visibility', 'visible', 'important');
                chatLine.style.setProperty('opacity', '1', 'important');
                
                // Restaurer les sous-éléments
                const messageBody = chatLine.querySelector('.chat-line__message-body');
                const username = chatLine.querySelector('.chat-author__display-name');
                
                if (messageBody) {
                  messageBody.style.setProperty('font-size', '13px', 'important');
                  messageBody.style.setProperty('display', 'block', 'important');
                }
                
                if (username) {
                  username.style.setProperty('font-size', '13px', 'important');
                  username.style.setProperty('display', 'inline', 'important');
                }
              }
            });
          }
          
          // Exécution IMMÉDIATE
          hideReplyElements();
          
          // Exécution dès que le DOM est prêt
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', hideReplyElements);
          }
          
          // Observer ultra-réactif
          const observer = new MutationObserver(function(mutations) {
            let needsUpdate = false;
            
            mutations.forEach(function(mutation) {
              if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                  if (node.nodeType === 1) {
                    const text = node.textContent || '';
                    if (text.includes('Répond à') || node.querySelector) {
                      needsUpdate = true;
                    }
                  }
                });
              }
            });
            
            if (needsUpdate) {
              setTimeout(hideReplyElements, 10);
            }
          });
          
          if (document.body) {
            observer.observe(document.body, {
              childList: true,
              subtree: true
            });
          }
          
          // Vérification continue mais plus espacée
          setInterval(hideReplyElements, 2000);
          
        })();
        </script>
        `,
        shutdown: false,
        restart_when_active: false
      }
    });

    // Positionner le chat à droite (canvas - largeur du chat)
    const chatPositionX = canvasWidth - chatWidth;
    
    const sceneItemId = await getSceneItemId(sceneName, chatSourceName);
    if (sceneItemId !== null) {
      await obs.call('SetSceneItemTransform', {
        sceneName: sceneName,
        sceneItemId: sceneItemId,
        sceneItemTransform: {
          positionX: chatPositionX,
          positionY: 0,
          scaleX: 1.0,
          scaleY: 1.0,
          boundsType: 'OBS_BOUNDS_NONE',
          cropLeft: 0,
          cropTop: 0,
          cropRight: 0,
          cropBottom: 0
        }
      });

      // Rendre visible
      await obs.call('SetSceneItemEnabled', {
        sceneName: sceneName,
        sceneItemId: sceneItemId,
        sceneItemEnabled: true
      });
    }

    logInfo(`[OBS] Chat created: ${chatWidth}x${chatHeight} at position ${chatPositionX},0 (Canvas: ${canvasWidth}x${canvasHeight})`);

  } catch (error) {
    logError(`[OBS] Failed to create chat source: ${error.message}`);
    throw error;
  }
}

async function deleteChatSource(sceneName, chatSourceName) {
  try {
    // Vérifier si la source existe
    const sceneItemId = await getSceneItemId(sceneName, chatSourceName);
    if (sceneItemId !== null) {
      // Supprimer l'item de la scène
      await obs.call('RemoveSceneItem', {
        sceneName: sceneName,
        sceneItemId: sceneItemId
      });
    }

    // Supprimer la source input
    try {
      await obs.call('RemoveInput', {
        inputName: chatSourceName
      });
      logInfo(`[OBS] Chat source ${chatSourceName} deleted`);
    } catch (e) {
      // Source n'existe peut-être pas, ce n'est pas grave
    }

  } catch (error) {
    logError(`[OBS] Failed to delete chat source: ${error.message}`);
  }
}

async function resizeMediaForChat(sceneName, mediaSourceName, withChat) {
  try {
    const sceneItemId = await getSceneItemId(sceneName, mediaSourceName);
    if (sceneItemId === null) return;

    // Récupérer la résolution du canvas depuis OBS
    const videoSettings = await obs.call('GetVideoSettings');
    const canvasWidth = videoSettings.baseWidth;
    const canvasHeight = videoSettings.baseHeight;

    if (withChat) {
      // Calculer la largeur du chat (même logique que createChatSource)
      let chatWidth;
      if (canvasWidth >= 1920) {
        chatWidth = Math.max(300, Math.floor(canvasWidth * 0.18));
      } else if (canvasWidth >= 1280) {
        chatWidth = Math.max(250, Math.floor(canvasWidth * 0.22));
      } else {
        chatWidth = Math.max(200, Math.floor(canvasWidth * 0.25));
      }
      
      // Calculer la largeur disponible pour la vidéo
      const videoWidth = canvasWidth - chatWidth;
      const scale = videoWidth / canvasWidth;
      
      // Calculer la hauteur de la vidéo redimensionnée pour le centrage vertical
      const videoHeight = canvasHeight * scale;
      const positionY = (canvasHeight - videoHeight) / 2;
      
      await obs.call('SetSceneItemTransform', {
        sceneName: sceneName,
        sceneItemId: sceneItemId,
        sceneItemTransform: {
          positionX: 0,
          positionY: positionY,
          scaleX: scale,
          scaleY: scale,
          boundsType: 'OBS_BOUNDS_NONE'
        }
      });
      
      logInfo(`[OBS] Video resized for chat: ${videoWidth}px width (scale: ${scale.toFixed(3)}, chat: ${chatWidth}px) on ${canvasWidth}x${canvasHeight} canvas`);
    } else {
      // Restaurer la taille pleine écran
      await obs.call('SetSceneItemTransform', {
        sceneName: sceneName,
        sceneItemId: sceneItemId,
        sceneItemTransform: {
          positionX: 0,
          positionY: 0,
          scaleX: 1.0,
          scaleY: 1.0,
          boundsType: 'OBS_BOUNDS_NONE'
        }
      });
      
      logInfo(`[OBS] Video restored to full size: ${canvasWidth}x${canvasHeight}`);
    }
  } catch (error) {
    logError(`[OBS] Failed to resize media source: ${error.message}`);
  }
}

async function getSceneItemId(sceneName, sourceName) {
  try {
    const sceneItems = await obs.call('GetSceneItemList', { sceneName });
    
    // D'abord essayer une correspondance exacte
    let item = sceneItems.sceneItems.find(item => item.sourceName === sourceName);
    
    // Si pas trouvé, essayer une correspondance insensible à la casse
    if (!item) {
      item = sceneItems.sceneItems.find(item => 
        item.sourceName.toLowerCase() === sourceName.toLowerCase()
      );
    }
    
    // Si toujours pas trouvé, essayer une correspondance partielle mais plus précise
    if (!item) {
      const sourceNameLower = sourceName.toLowerCase();
      const baseSourceName = sourceName.replace(/^(Stream_|Media_|Chat_)/, '');
      const sourceType = sourceName.match(/^(Stream_|Media_|Chat_)/)?.[0] || '';
      
      item = sceneItems.sceneItems.find(item => {
        const itemNameLower = item.sourceName.toLowerCase();
        
        // Si on cherche spécifiquement un type (Media_, Chat_, etc.)
        if (sourceType) {
          // Correspondance avec le bon type et le bon nom de streamer
          return itemNameLower.startsWith(sourceType.toLowerCase()) &&
                 itemNameLower.includes(baseSourceName.toLowerCase());
        }
        
        // Correspondance générale (fallback)
        return itemNameLower.includes(baseSourceName.toLowerCase());
      });
    }
    
    return item ? item.sceneItemId : null;
  } catch (error) {
    logDebug(`[OBS] Failed to get scene item ID for ${sourceName} in ${sceneName}: ${error.message}`);
    return null;
  }
}

function extractTwitchUsername(twitchUrl) {
  try {
    const match = twitchUrl.match(/twitch\.tv\/(.+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function getChatDisplayStatus(streamerName) {
  if (!isObsConnected) {
    return false;
  }

  try {
    // Chercher la vraie scène pour ce streamer
    const scenes = await obs.call('GetSceneList');
    const existingScene = findSceneByStreamerName(scenes.scenes, streamerName);
    
    if (!existingScene) {
      logDebug(`[OBS] No scene found for streamer ${streamerName}`);
      return false;
    }
    
    const sceneName = existingScene.sceneName;
    const chatSourceName = `Chat_${streamerName}`;
    
    logDebug(`[OBS] Checking chat status for ${streamerName} in scene ${sceneName}, looking for source ${chatSourceName}`);
    
    // Lister toutes les sources de la scène pour diagnostic
    const sceneItems = await obs.call('GetSceneItemList', { sceneName });
    logDebug(`[OBS] Sources in scene ${sceneName}:`, sceneItems.sceneItems.map(item => item.sourceName));
    
    // Vérifier si la source chat existe
    const chatItem = sceneItems.sceneItems.find(item => 
      item.sourceName === chatSourceName || 
      item.sourceName.toLowerCase() === chatSourceName.toLowerCase()
    );
    
    if (!chatItem) {
      logDebug(`[OBS] No chat source found for ${streamerName} (expected: ${chatSourceName})`);
      return false;
    }
    
    logDebug(`[OBS] Found chat source: ${chatItem.sourceName}, checking if enabled...`);
    
    // Vérifier si la source chat est visible/activée
    const itemInfo = await obs.call('GetSceneItemEnabled', {
      sceneName: sceneName,
      sceneItemId: chatItem.sceneItemId
    });

    const isEnabled = itemInfo.sceneItemEnabled || false;
    logDebug(`[OBS] Chat source ${chatItem.sourceName} is ${isEnabled ? 'enabled' : 'disabled'}`);
    
    return isEnabled;
  } catch (error) {
    // Only log this occasionally to avoid spam  
    if (!getChatDisplayStatus.lastErrorLog || Date.now() - getChatDisplayStatus.lastErrorLog > 30000) {
      logDebug(`[OBS] Could not get chat display status for ${streamerName}: ${error.message}`);
      getChatDisplayStatus.lastErrorLog = Date.now();
    }
    return false;
  }
}

async function createExistingStreamerScenes() {
  if (!isObsConnected || streams.length === 0) return;

  logInfo(`[OBS] 🎬 Creating scenes for ${streams.length} existing streams...`);
  
  for (const stream of streams) {
    if (stream.httpUrl) {
      try {
        await createStreamerScene(stream.name, stream.httpUrl);
        // Petit délai pour éviter de surcharger OBS
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        logError(`[OBS] Failed to create scene for existing stream ${stream.name}:`, error.message);
      }
    }
  }
  
  logInfo(`[OBS] ✅ Finished creating scenes for existing streams`);
}

// --- EventSub WebSocket ---
const eventsubWsUrl = 'wss://eventsub.wss.twitch.tv/ws';

let eventsubSocket = null;
let eventsubSessionId = null;
const streamerStatus = {};
let eventsubReconnectDelay = 5000;
const EVENTSUB_RECONNECT_DELAY_MIN = 5000;
const EVENTSUB_RECONNECT_DELAY_MAX = 120000;

// Cache pour la liste des streamers ZEvent
let zEventStreamers = [];
let zEventLastUpdate = 0;
const ZEVENT_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getZEventStreamers() {
  const now = Date.now();
  if (now - zEventLastUpdate < ZEVENT_CACHE_DURATION && zEventStreamers.length > 0) {
    return zEventStreamers;
  }
  
  try {
    // Essayer d'abord l'API en direct
    logDebug('[ZEvent] Fetching streamers from zevent.fr/api...');
    const response = await fetch('https://zevent.fr/api/');
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const json = await response.json();
    zEventStreamers = json.live.map(s => s.twitch.toLowerCase());
    zEventLastUpdate = now;
    logInfo(`[ZEvent] ✅ Loaded ${zEventStreamers.length} streamers from live API`);
    return zEventStreamers;
    
  } catch (apiError) {
    logError(`[ZEvent] ❌ API call failed: ${apiError.message}`);
    return [];
  }
}

function isZEventStreamer(streamerName) {
  const name = streamerName.toLowerCase();
  return zEventStreamers.includes(name);
}

function connectEventSubWs() {
  eventsubSocket = new (require('ws'))(eventsubWsUrl);
  eventsubSocket.on('open', () => {
    logDebug('[Twitch EventSub] WebSocket connected');
    eventsubReconnectDelay = EVENTSUB_RECONNECT_DELAY_MIN;
  });
  eventsubSocket.on('message', async (data) => {
    const msg = JSON.parse(data);
    if (msg.metadata && msg.metadata.message_type === 'session_welcome') {
      eventsubSessionId = msg.payload.session.id;
      logInfo(`[Twitch EventSub] 🤝 Session established (ID: ${eventsubSessionId})`);
      
      // (Ré)abonne tous les streamers suivis
      const streamsCount = streams.length;
      logInfo(`[Twitch EventSub] 📋 Found ${streamsCount} streams to subscribe to`);
      
      if (streamsCount === 0) {
        logWarn('[Twitch EventSub] ⚠️ No streams to subscribe to - connection may be closed by Twitch');
      }
      
      for (const s of streams) {
        await subscribeToStreamEvents(s.name);
      }
      
      if (streamsCount > 0) {
        logInfo(`[Twitch EventSub] 🎯 Finished subscribing to ${streamsCount} streamers`);
      }
    }
    if (msg.metadata && msg.metadata.message_type === 'notification') {
      const ev = msg.payload.event;
      if (msg.payload.subscription.type === 'stream.online') {
        streamerStatus[ev.broadcaster_user_login] = true;
        logInfo(`[Twitch EventSub] 🟢 ${ev.broadcaster_user_login} is ONLINE`);
      }
      if (msg.payload.subscription.type === 'stream.offline') {
        streamerStatus[ev.broadcaster_user_login] = false;
        logInfo(`[Twitch EventSub] 🔴 ${ev.broadcaster_user_login} is OFFLINE`);
      }
    }
  });
  eventsubSocket.on('close', (code, reason) => {
    logDebug(`[Twitch EventSub] WebSocket closed (code=${code}, reason=${reason && reason.toString('utf8')}). Reconnecting in ${Math.round(eventsubReconnectDelay/1000)}s...`);
    setTimeout(connectEventSubWs, eventsubReconnectDelay);
    eventsubReconnectDelay = Math.min(eventsubReconnectDelay * 2, EVENTSUB_RECONNECT_DELAY_MAX);
  });
  eventsubSocket.on('error', (err) => {
    logError('[Twitch EventSub] WebSocket error:', err);
  });
}

async function subscribeToStreamEvents(login) {
  if (!eventsubSessionId) {
    logWarn(`[Twitch EventSub] Cannot subscribe to ${login}: no session ID`);
    return;
  }
  
  logDebug(`[Twitch EventSub] 🔄 Subscribing to events for ${login}...`);
  
  try {
    const token = await getTwitchAppToken();
    if (!token) {
      logError(`[Twitch EventSub] ❌ Cannot subscribe to ${login}: no app token`);
      return;
    }
    
    // Get user_id from login
    const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!userRes.ok) {
      logError(`[Twitch EventSub] ❌ Failed to get user info for ${login}: ${userRes.status}`);
      return;
    }
    
    const userData = await userRes.json();
    if (!userData.data || !userData.data[0]) {
      logError(`[Twitch EventSub] ❌ User ${login} not found`);
      return;
    }
    
    const user_id = userData.data[0].id;
    logDebug(`[Twitch EventSub] 👤 Found user ${login} (ID: ${user_id})`);
    
    let successCount = 0;
    
    for (const type of ['stream.online', 'stream.offline']) {
      try {
        const subRes = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
          method: 'POST',
          headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type,
            version: '1',
            condition: { broadcaster_user_id: user_id },
            transport: {
              method: 'websocket',
              session_id: eventsubSessionId,
            },
          }),
        });
        
        if (subRes.ok) {
          const subData = await subRes.json();
          logDebug(`[Twitch EventSub] ✅ Subscribed to ${type} for ${login} (ID: ${subData.data[0]?.id})`);
          successCount++;
        } else {
          const errorData = await subRes.json();
          logError(`[Twitch EventSub] ❌ Failed to subscribe to ${type} for ${login}: ${subRes.status} - ${errorData.message || 'Unknown error'}`);
        }
      } catch (error) {
        logError(`[Twitch EventSub] ❌ Error subscribing to ${type} for ${login}:`, error.message);
      }
    }
    
    if (successCount > 0) {
      logInfo(`[Twitch EventSub] 🎯 Successfully subscribed to ${successCount}/2 events for ${login}`);
    } else {
      logError(`[Twitch EventSub] 💥 Failed to subscribe to any events for ${login}`);
    }
    
  } catch (error) {
    logError(`[Twitch EventSub] ❌ Error subscribing to events for ${login}:`, error.message);
  }
}

let streamStatusCheckInterval = null;

function startStreamStatusMonitoring() {
  if (streamStatusCheckInterval) {
    clearInterval(streamStatusCheckInterval);
  }
  
  // Vérifier le statut toutes les 2 minutes
  streamStatusCheckInterval = setInterval(async () => {
    if (streams.length === 0) return;
    
    try {
      const token = await getTwitchAppToken();
      if (!token) return;
      
      // Récupérer les logins de tous les streams
      const logins = streams.map(s => s.name).join('&user_login=');
      
      const response = await fetch(`https://api.twitch.tv/helix/streams?user_login=${logins}`, {
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        const liveStreamers = new Set(data.data.map(stream => stream.user_login.toLowerCase()));
        
        // Mettre à jour le statut pour tous les streamers
        for (const stream of streams) {
          const wasOnline = streamerStatus[stream.name.toLowerCase()];
          const isOnline = liveStreamers.has(stream.name.toLowerCase());
          
          if (wasOnline !== isOnline) {
            streamerStatus[stream.name.toLowerCase()] = isOnline;
            logInfo(`[Twitch Monitor] ${isOnline ? '🟢' : '🔴'} ${stream.name} is ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
          }
        }
        
        logDebug(`[Twitch Monitor] 📊 Checked ${streams.length} streamers, ${liveStreamers.size} online`);
      }
    } catch (error) {
      logError('[Twitch Monitor] ❌ Error checking stream status:', error.message);
    }
  }, 120000);
  
  logInfo('[Twitch Monitor] 🔄 Started periodic stream status monitoring (every 2 minutes)');
}

try {
  require('dotenv').config();
} catch (e) {}

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || '';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '';
let TWITCH_APP_TOKEN = '';

// Récupère un app access token si besoin
async function getTwitchAppToken() {
  if (TWITCH_APP_TOKEN) return TWITCH_APP_TOKEN;
  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    client_secret: TWITCH_CLIENT_SECRET,
    grant_type: 'client_credentials',
  });
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: params,
  });
  const data = await res.json();
  TWITCH_APP_TOKEN = data.access_token;
  return TWITCH_APP_TOKEN;
}

// Vérifie si un streamer est online via l’API Twitch
async function getTwitchStreamStatus(name) {
  const token = await getTwitchAppToken();
  // Get stream info
  const url = `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`,
    },
  });
  const data = await res.json();
  const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(name)}`, {
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`,
    },
  });
  const userData = await userRes.json();
  const profileUrl = userData && userData.data && userData.data[0] ? userData.data[0].profile_image_url : null;
  
  await getZEventStreamers();
  const isZEvent = isZEventStreamer(name);
  
  if (data && data.data && data.data.length > 0) {
    return { 
      online: true, 
      title: data.data[0].title, 
      viewers: data.data[0].viewer_count, 
      profileUrl,
      isZEventStreamer: isZEvent
    };
  }
  return { 
    online: false, 
    profileUrl,
    isZEventStreamer: isZEvent
  };
}
const { execFile } = require('child_process');
const http = require('http');
const swaggerUi = require('swagger-ui-express');
const swaggerJSDoc = require('swagger-jsdoc');
//const url = require('url');

// Default port to match frontend expectations
const DEFAULT_PORT = 3001;

// Configuration Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ZEvent Streamlink API',
      version: '1.0.0',
      description: 'API pour la gestion des streams Twitch avec intégration ZEvent et Streamlink',
    },
    servers: [
      {
        url: `http://localhost:${DEFAULT_PORT}`,
        description: 'Serveur de développement',
      },
    ],
    tags: [
      {
        name: 'Health',
        description: 'Endpoints de monitoring et santé du service',
      },
      {
        name: 'Streams',
        description: 'Gestion des streams Twitch et récupération des flux M3U8',
      },
      {
        name: 'ZEvent',
        description: 'Intégration avec les données du ZEvent (streamers et statistiques)',
      },
      {
        name: 'OBS',
        description: 'Intégration avec OBS Studio via WebSocket',
      },
    ],
  },
  apis: [__filename], // Utilise ce fichier pour les annotations
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

// Persistance des flux dans streams.json
const fs = require('fs');
const path = require('path');
const streamsFile = path.join(__dirname, 'streams.json');
let streams = [];
let nextId = 1;

// Obtenir la préférence hardware decoding pour un streamer (par défaut: false)
function getHwDecodingPreference(streamerName) {
  const stream = streams.find(s => s.name === streamerName);
  return stream?.hardwareDecoding || false;
}

// Définir la préférence hardware decoding pour un streamer
function setHwDecodingPreference(streamerName, enabled) {
  const stream = streams.find(s => s.name === streamerName);
  if (stream) {
    stream.hardwareDecoding = enabled;
    saveStreams();
    logDebug(`[HW Decoding] Set ${streamerName} hardware decoding to ${enabled}`);
  }
}

// Charge les flux existants au démarrage
try {
  const arr = JSON.parse(fs.readFileSync(streamsFile, 'utf8'));
  if (Array.isArray(arr)) {
    streams = arr;
    // nextId = max id + 1
    nextId = streams.reduce((max, s) => Math.max(max, parseInt(s.id, 10) || 0), 0) + 1;
  }
} catch (e) {
  streams = [];
  nextId = 1;
}

function migrateHardwareDecodingPrefs() {
  const oldHwFile = path.join(__dirname, 'hardware-decoding.json');
  
  try {
    if (fs.existsSync(oldHwFile)) {
      logInfo('[Migration] 🔄 Migrating hardware decoding preferences...');
      const oldPrefs = JSON.parse(fs.readFileSync(oldHwFile, 'utf8'));
      
      let migrated = false;
      streams.forEach(stream => {
        if (oldPrefs.hasOwnProperty(stream.name) && !stream.hasOwnProperty('hardwareDecoding')) {
          stream.hardwareDecoding = oldPrefs[stream.name];
          migrated = true;
          logInfo(`[Migration] ✅ Migrated hardware decoding preference for ${stream.name}: ${oldPrefs[stream.name]}`);
        }
      });
      
      if (migrated) {
        saveStreams();
        logInfo('[Migration] ✅ Hardware decoding preferences migrated successfully');
      }
      
      fs.unlinkSync(oldHwFile);
      logInfo('[Migration] 🗑️ Removed old hardware-decoding.json file');
    }
  } catch (error) {
    logError('[Migration] ❌ Error migrating hardware decoding preferences:', error);
  }
}

migrateHardwareDecodingPrefs();

// Fonction pour réappliquer les préférences hardware decoding à une source existante
async function applyHwDecodingPreference(streamerName) {
  if (!isObsConnected) return;
  
  const preferredHwDecoding = getHwDecodingPreference(streamerName);
  try {
    const sourceName = `Media_${streamerName}`;
    let realSourceName = sourceName;
    
    // Chercher la vraie source
    try {
      await obs.call('GetInputSettings', { inputName: sourceName });
    } catch (sourceError) {
      const sceneName = `Stream_${streamerName}`;
      try {
        const sceneItems = await obs.call('GetSceneItemList', { sceneName });
        const mediaItem = sceneItems.sceneItems.find(item => 
          item.sourceName.includes(streamerName) || 
          item.sourceName.includes('Media_') ||
          item.inputKind === 'ffmpeg_source'
        );
        
        if (mediaItem) {
          realSourceName = mediaItem.sourceName;
        } else {
          return;
        }
      } catch (sceneError) {
        return;
      }
    }
    
    // Appliquer la préférence
    await obs.call('SetInputSettings', {
      inputName: realSourceName,
      inputSettings: {
        hw_decode: preferredHwDecoding,
        restart_on_activate: false  // Maintenir la case décochée
      }
    });
    
    logInfo(`[OBS] ✅ Applied HW decoding preference (${preferredHwDecoding}) to existing source: ${realSourceName}`);
  } catch (error) {
    logDebug(`[OBS] Could not apply HW decoding preference for ${streamerName}: ${error.message}`);
  }
}

// Fonction pour mettre à jour les informations ZEvent des streams existants
async function updateStreamsZEventInfo() {
  await getZEventStreamers();
  let updated = false;
  
  for (const stream of streams) {
    // Extraire le nom du streamer depuis l'URL Twitch
    const match = stream.twitchUrl?.match(/twitch\.tv\/([a-zA-Z0-9_]+)/i);
    const streamerName = match ? match[1] : stream.name;
    const isZEvent = isZEventStreamer(streamerName);
    
    if (stream.isZEventStreamer !== isZEvent) {
      stream.isZEventStreamer = isZEvent;
      updated = true;
    }
  }
  
  if (updated) {
    saveStreams();
    logDebug('[ZEvent] Updated stream ZEvent info');
  }
}

// Sauvegarde les flux dans streams.json
function saveStreams() {
  try {
    // Réorganiser les IDs pour qu'ils soient séquentiels
    streams.forEach((stream, index) => {
      stream.id = String(index + 1);
    });
    
    // Recalculer nextId
    nextId = streams.length + 1;
    
    fs.writeFileSync(streamsFile, JSON.stringify(streams, null, 2), 'utf8');
  } catch (e) {
    logError('[streams] Failed to save streams.json:', e);
  }
}

function getStreamUrl(streamer, quality, cb) {
  if (typeof quality === 'function') {
    cb = quality;
    quality = 'best';
  }
  quality = quality || 'best';

  if (!streamer || typeof streamer !== 'string') return cb(new Error('missing streamer'));
  const urlMatch = String(streamer).match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/@?([a-zA-Z0-9_]+)/i);
  let clean = null;
  if (urlMatch) {
    clean = urlMatch[1];
  } else {
    const nameMatch = String(streamer).match(/^@?([a-zA-Z0-9_]+)$/);
    if (nameMatch) clean = nameMatch[1];
  }

  if (!clean) return cb(new Error('invalid streamer name'));

  const fallbackMap = {
    '720p': ['720p', '720p50', '720p60'],
    '1080p': ['1080p', '1080p50', '1080p60']
  };

  const toTry = fallbackMap[quality] || [quality];

  const tryOne = (index) => {
    if (index >= toTry.length) {
      return cb(new Error(`no url returned by streamlink for qualities: ${toTry.join(', ')}`));
    }
    const q = toTry[index];
    const args = ['--stream-url', `https://twitch.tv/${clean}`, q];

    execFile('streamlink', args, { timeout: 20000 }, (err, stdout, stderr) => {
      // If streamlink returned something on stdout, accept it
      const out = (stdout || '').toString().trim();
      if (out) return cb(null, out);

      // If error, try next quality; if last, return error
      if (err) {
        // try next
        return tryOne(index + 1);
      }

      // no stdout but no err — try next
      return tryOne(index + 1);
    });
  };

  tryOne(0);
}

function extractStreamerName(input) {
  if (!input || typeof input !== 'string') return null;
  
  const urlMatch = input.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/@?([a-zA-Z0-9_]+)/i);
  if (urlMatch) return urlMatch[1];
  
  const nameMatch = input.match(/^@?([a-zA-Z0-9_]+)$/);
  if (nameMatch) return nameMatch[1];
  
  return null;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c.toString(); });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, code, obj) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

async function handleApi(req, res) {
  const fullUrl = `http://localhost${req.url}`;
  const parsedUrl = new URL(fullUrl);
  const pathname = parsedUrl.pathname || '';
  // Log la requête entrante (sans status pour l'instant)
  logApi(req.method, pathname);

  /**
   * @swagger
   * /api/streams:
   *   get:
   *     tags:
   *       - Streams
   *     summary: Liste tous les streams enregistrés
   *     description: Retourne la liste de tous les streams avec leurs informations enrichies (statut live, détails ZEvent)
   *     responses:
   *       200:
   *         description: Liste des streams récupérée avec succès
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 streams:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: string
   *                         description: Identifiant unique du stream
   *                       name:
   *                         type: string
   *                         description: Nom du streamer
   *                       twitchUrl:
   *                         type: string
   *                         description: URL Twitch du streamer
   *                       m3u8Url:
   *                         type: string
   *                         description: URL du flux M3U8 généré par Streamlink
   *                       quality:
   *                         type: string
   *                         description: Qualité sélectionnée (best, worst, 720p, etc.)
   *                       isLive:
   *                         type: boolean
   *                         description: True si le streamer est actuellement en live
   *                       isZEvent:
   *                         type: boolean
   *                         description: True si le streamer participe au ZEvent
   *                       twitchTitle:
   *                         type: string
   *                         nullable: true
   *                         description: Titre du stream Twitch
   *                       twitchViewers:
   *                         type: number
   *                         nullable: true
   *                         description: Nombre de viewers sur Twitch
   *                       profileUrl:
   *                         type: string
   *                         nullable: true
   *                         description: URL de l'avatar Twitch
   *                       hardwareDecoding:
   *                         type: boolean
   *                         description: État du décodage matériel OBS pour ce stream
   *                       chatEnabled:
   *                         type: boolean
   *                         description: État de l'affichage du chat Twitch dans OBS pour ce stream
   *   post:
   *     tags:
   *       - Streams
   *     summary: Ajoute un nouveau stream
   *     description: Crée un nouveau stream avec les paramètres fournis
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *               - twitchUrl
   *             properties:
   *               name:
   *                 type: string
   *               twitchUrl:
   *                 type: string
   *               quality:
   *                 type: string
   *                 default: best
   *               hardwareDecoding:
   *                 type: boolean
   *                 default: false
   *                 description: Active le décodage matériel OBS pour ce stream
   *     responses:
   *       201:
   *         description: Stream créé avec succès
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 stream:
   *                   type: object
   *       400:
   *         description: Paramètres manquants ou invalides
   */

  /**
   * @swagger
   * /health:
   *   get:
   *     tags:
   *       - Health
   *     summary: Health check du service
   *     description: Vérifie l'état de santé du service et ses dépendances
   *     responses:
   *       200:
   *         description: Service en bonne santé
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: "healthy"
   *                 timestamp:
   *                   type: string
   *                   format: date-time
   *                 uptime:
   *                   type: number
   *                   description: Uptime en secondes
   *                 response_time:
   *                   type: number
   *                   description: Temps de réponse en millisecondes
   *                 services:
   *                   type: object
   *                   properties:
   *                     twitch_api:
   *                       type: string
   *                       enum: ["healthy", "degraded", "unhealthy"]
   *                     zevent_api:
   *                       type: string
   *                       enum: ["healthy", "degraded", "unhealthy"]
   *                     streamlink:
   *                       type: string
   *                       enum: ["healthy", "degraded", "unhealthy"]
   *                 stats:
   *                   type: object
   *                   properties:
   *                     total_streams:
   *                       type: number
   *                     active_streams:
   *                       type: number
   *       503:
   *         description: Service indisponible
   */

  // GET /api/streams
  if (req.method === 'GET' && pathname === '/api/streams') {
    try {
      // Enrichir chaque flux avec le statut live de Twitch
      const enrichedStreams = await Promise.all(streams.map(async (stream) => {
        try {
          // Extraire le nom du streamer depuis l'URL Twitch
          const urlMatch = stream.twitchUrl.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/@?([a-zA-Z0-9_]+)/i);
          const streamerName = urlMatch ? urlMatch[1] : null;
          
          let twitchStatus = { online: false, title: null, viewers: null, profileUrl: null };
          
          if (streamerName) {
            twitchStatus = await getTwitchStreamStatus(streamerName);
          }
          
          // Vérifier si c'est un streamer ZEvent
          const isZEvent = isZEventStreamer(streamerName || stream.name);
          
          // Récupérer l'état du décodage matériel
          let hardwareDecoding = false;
          let chatEnabled = false;
          try {
            if (isObsConnected) {
              hardwareDecoding = await getHardwareDecodingStatus(stream.name);
              chatEnabled = await getChatDisplayStatus(stream.name);
            }
          } catch (e) {
            // Silencieux - pas grave si on ne peut pas récupérer l'état
          }
          
          // Nettoyer et retourner seulement les champs utiles
          return {
            id: stream.id,
            name: stream.name,
            twitchUrl: stream.twitchUrl,
            m3u8Url: stream.m3u8Url || stream.httpUrl,
            quality: stream.quality,
            isLive: twitchStatus.online,
            isZEvent: isZEvent,
            twitchTitle: twitchStatus.title,
            twitchViewers: twitchStatus.viewers,
            profileUrl: twitchStatus.profileUrl,
            hardwareDecoding: hardwareDecoding,
            chatEnabled: chatEnabled
          };
        } catch (err) {
          logError(`Erreur lors de la vérification du statut Twitch pour ${stream.name}:`, err.message);
          logDebug('Stack trace:', err.stack);
          
          // Vérifier si c'est un streamer ZEvent même en cas d'erreur
          const isZEvent = isZEventStreamer(stream.name);
          
          // Récupérer l'état du décodage matériel même en cas d'erreur Twitch
          let hardwareDecoding = stream.hardwareDecoding || false;
          let chatEnabled = false;
          try {
            if (isObsConnected) {
              // Utiliser la valeur stockée, mais vérifier le statut réel dans OBS si possible
              const obsHwDecoding = await getHardwareDecodingStatus(stream.name);
              hardwareDecoding = obsHwDecoding !== undefined ? obsHwDecoding : hardwareDecoding;
              chatEnabled = await getChatDisplayStatus(stream.name);
            }
          } catch (e) {
            // Silencieux - pas grave si on ne peut pas récupérer l'état
          }
          
          return {
            id: stream.id,
            name: stream.name,
            twitchUrl: stream.twitchUrl,
            m3u8Url: stream.m3u8Url || stream.httpUrl,
            quality: stream.quality,
            isLive: false,
            isZEvent: isZEvent,
            twitchTitle: null,
            twitchViewers: null,
            profileUrl: null,
            hardwareDecoding: hardwareDecoding,
            chatEnabled: chatEnabled
          };
        }
      }));
      
      return sendJson(res, 200, { success: true, streams: enrichedStreams });
    } catch (err) {
      logError('Erreur lors de l\'enrichissement des flux:', err.message);
      logDebug('Stack trace:', err.stack);
      return sendJson(res, 200, { success: true, streams });
    }
  }

  // POST /api/streams  -> add stream, fetch m3u8 via streamlink
  if (req.method === 'POST' && pathname === '/api/streams') {
    return parseJsonBody(req).then(body => {
      const name = body.name || null;
      const twitchUrl = body.twitchUrl || body.twitch || '';
      const quality = body.quality || 'best';
      const hardwareDecoding = body.hardwareDecoding || false;

      // derive streamer name more robustly
      const maybe = String(twitchUrl || name || '');
      const urlMatch = maybe.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/@?([a-zA-Z0-9_]+)/i);
      const nameMatch = maybe.match(/^@?([a-zA-Z0-9_]+)$/);
      const streamer = urlMatch ? urlMatch[1] : (nameMatch ? nameMatch[1] : null);
      if (!streamer) return sendJson(res, 400, { success: false, error: 'invalid twitch url or name' });

      getStreamUrl(streamer, quality, async (err, m3u8) => {
        if (err) return sendJson(res, 500, { success: false, error: err.message });

        // Vérifier si c'est un streamer ZEvent
        await getZEventStreamers();
        const isZEvent = isZEventStreamer(streamer);

        const s = {
          id: String(nextId++),
          name: name || streamer,
          twitchUrl: `https://twitch.tv/${streamer}`,
          quality,
          isLive: true, // le stream est récupéré donc il est live
          m3u8Url: m3u8, // URL M3U8 directe
          isZEventStreamer: isZEvent,
          hardwareDecoding: hardwareDecoding || false // Stocker la préférence dans le stream
        };

        streams.push(s);
        saveStreams();
        
        // Créer automatiquement la scène OBS pour ce streamer
        if (isObsConnected) {
          createStreamerScene(streamer, m3u8, hardwareDecoding).catch(e => {
            logError(`[OBS] Failed to create scene for ${streamer}:`, e.message);
          });
        }
        
        // Souscription EventSub si session active
        if (typeof subscribeToStreamEvents === 'function' && eventsubSessionId) {
          subscribeToStreamEvents(s.name).catch(e => {
            logError('[Twitch EventSub] Subscription error for', s.name, e);
          });
        }
        return sendJson(res, 201, { success: true, stream: s });
      });
    }).catch(err => sendJson(res, 400, { success: false, error: 'invalid json body' }));
  }

  /**
   * @swagger
   * /api/streams/{id}:
   *   delete:
   *     tags:
   *       - Streams
   *     summary: Supprime un stream
   *     description: Supprime un stream de la liste par son ID. La suppression sera refusée si c'est la seule scène OBS active.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID du stream à supprimer
   *     responses:
   *       200:
   *         description: Stream supprimé avec succès
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 message:
   *                   type: string
   *       400:
   *         description: Suppression impossible (seule scène OBS active)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 error:
   *                   type: string
   *                   example: "Impossible de supprimer le stream : c'est la seule scène dans OBS et elle ne peut pas être supprimée."
   *       404:
   *         description: Stream non trouvé
   */
  // DELETE /api/streams/{id} -> supprimer un stream
  if (req.method === 'DELETE' && pathname.startsWith('/api/streams/')) {
    const streamId = pathname.split('/').pop();
    if (!streamId) return sendJson(res, 400, { success: false, error: 'Missing stream ID' });

    const streamIndex = streams.findIndex(s => s.id === streamId);
    if (streamIndex === -1) {
      return sendJson(res, 404, { success: false, error: 'Stream not found' });
    }

    const deletedStream = streams[streamIndex];
    
    // Vérifier d'abord si on peut supprimer la scène OBS
    if (isObsConnected) {
      try {
        // Tester si on peut supprimer la scène sans vraiment la supprimer
        const sceneName = `Stream_${deletedStream.name}`;
        const scenes = await obs.call('GetSceneList');
        const currentScene = await getCurrentOBSScene();
        
        // Si c'est la seule scène ET qu'elle est active, on refuse la suppression
        if (scenes.scenes.length <= 1) {
          return sendJson(res, 400, { 
            success: false, 
            error: `Impossible de supprimer le stream "${deletedStream.name}" : c'est la seule scène dans OBS et elle ne peut pas être supprimée.` 
          });
        }
        
        // Si la scène à supprimer est la scène actuelle et qu'il n'y a qu'elle, refuser
        if (currentScene === sceneName && scenes.scenes.filter(s => s.sceneName !== sceneName).length === 0) {
          return sendJson(res, 400, { 
            success: false, 
            error: `Impossible de supprimer le stream "${deletedStream.name}" : c'est la seule scène active dans OBS.` 
          });
        }
        
      } catch (e) {
        logError(`[OBS] Failed to check scene status for ${deletedStream.name}:`, e.message);
        // En cas d'erreur de vérification, on laisse continuer mais on prévient
      }
    }

    // Si on arrive ici, on peut supprimer le stream
    streams.splice(streamIndex, 1);
    saveStreams();

    // Supprimer automatiquement la scène OBS pour ce streamer
    if (isObsConnected) {
      try {
        logInfo(`[OBS] 🗑️ Attempting to delete OBS scene for ${deletedStream.name}`);
        const sceneDeleted = await deleteStreamerScene(deletedStream.name);
        if (sceneDeleted) {
          logInfo(`[OBS] ✅ OBS scene deleted successfully for ${deletedStream.name}`);
          // Small delay to prevent race conditions with concurrent API calls
          await new Promise(resolve => setTimeout(resolve, 200));
        } else {
          logWarn(`[OBS] ⚠️ Scene could not be deleted for ${deletedStream.name}`);
        }
      } catch (e) {
        logError(`[OBS] ❌ Failed to delete scene for ${deletedStream.name}:`, e.message);
      }
    }

    logInfo(`[api] Stream supprimé: ${deletedStream.name} (ID: ${streamId})`);
    return sendJson(res, 200, { 
      success: true, 
      message: `Stream "${deletedStream.name}" supprimé avec succès` 
    });
  }

  /**
   * @swagger
   * /api/qualities:
   *   get:
   *     tags:
   *       - Streams
   *     summary: Récupère les qualités disponibles pour une URL Twitch
   *     description: Utilise Streamlink pour lister toutes les qualités disponibles pour un stream Twitch
   *     parameters:
   *       - in: query
   *         name: twitchUrl
   *         required: true
   *         schema:
   *           type: string
   *         description: URL du stream Twitch ou nom du streamer
   *     responses:
   *       200:
   *         description: Qualités récupérées avec succès
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 qualities:
   *                   type: array
   *                   items:
   *                     type: string
   *       400:
   *         description: URL Twitch manquante
   *       500:
   *         description: Erreur lors de la récupération des qualités
   */
  // GET /api/qualities?twitchUrl=... -> return available qualities from streamlink
  if (req.method === 'GET' && pathname.startsWith('/api/qualities')) {
    const q = Object.fromEntries(parsedUrl.searchParams.entries());
    const maybe = q.twitchUrl || q.streamer || '';
    if (!maybe) return sendJson(res, 400, { success: false, error: 'missing twitchUrl param' });

    // extract streamer name
  const urlMatch = String(maybe).match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/@?([a-zA-Z0-9_]+)/i);
  const nameMatch = String(maybe).match(/^@?([a-zA-Z0-9_]+)$/);
  const streamer = urlMatch ? urlMatch[1] : (nameMatch ? nameMatch[1] : null);
  logDebug('[api] qualities for', streamer);
    if (!streamer) return sendJson(res, 400, { success: false, error: 'invalid twitch url or name' });

    // call streamlink to list available streams
    const args = [`https://twitch.tv/${streamer}`];
    execFile('streamlink', args, { timeout: 12000 }, (err, stdout, stderr) => {
      if (err) {
        logDebug('[api] streamlink error:', err && err.message, stderr && stderr.toString())
      }
      const combined = `${stdout || ''}\n${stderr || ''}`;
      // try to find "Available streams:" line
      const m = combined.match(/Available streams:\s*([^\n\r]+)/i);
      if (!m) {
        return sendJson(res, 200, { success: true, qualities: [] });
      }

      const list = m[1].split(',').map(s => s.trim()).filter(Boolean).map(item => {
        // extract token before space or parenthesis
        const token = item.split(/\s|\(/)[0];
        return token;
      });

      // unique
      const uniq = Array.from(new Set(list));
      return sendJson(res, 200, { success: true, qualities: uniq });
    });
    // prevent fallthrough to other handlers which would send a 404 -> double headers
    return;
  }

  // DELETE /api/streams/:id
  if (req.method === 'DELETE' && pathname.startsWith('/api/streams/')) {
    const parts = pathname.split('/');
    const id = parts[3];
    const idx = streams.findIndex(x => x.id === id);
    if (idx === -1) return sendJson(res, 404, { success: false, error: 'not found' });
    streams.splice(idx, 1);
    saveStreams();
    return sendJson(res, 200, { success: true });
  }

  // PATCH /api/streams/:id/quality -> change quality (fetch new m3u8)
  if (req.method === 'PATCH' && /^\/api\/streams\/[^\/]+\/quality$/.test(pathname)) {
    const parts = pathname.split('/');
    const id = parts[3];
    const stream = streams.find(x => x.id === id);
    if (!stream) return sendJson(res, 404, { success: false, error: 'not found' });

    return parseJsonBody(req).then(body => {
      const quality = body.quality || 'best';
      // call streamlink with fallbacks handled in getStreamUrl
      return new Promise((resolve) => {
        // Extraire le nom du streamer depuis l'URL ou utiliser le nom directement
        const streamerName = extractStreamerName(stream.twitchUrl || stream.name);
        getStreamUrl(streamerName, quality, (err, m3u8) => {
          if (err) {
            return sendJson(res, 500, { success: false, error: err.message });
          }

          // update stream record
          stream.quality = quality;
          stream.m3u8Url = m3u8;
          
          // Mettre à jour l'URL de la source media OBS
          if (isObsConnected) {
            updateMediaSourceUrl(stream.name, m3u8).catch(e => {
              logError(`[OBS] Failed to update media source URL for ${stream.name}:`, e.message);
            });
          }

          return sendJson(res, 200, { success: true, restarted: false, stream });
        });
      });
    }).catch(() => sendJson(res, 400, { success: false, error: 'invalid json body' }));
  }

  /**
   * @swagger
   * /api/streams/{id}/hardware-decoding:
   *   patch:
   *     tags:
   *       - Streams
   *     summary: Active/désactive le décodage matériel OBS
   *     description: Modifie l'état du décodage matériel pour la source media OBS d'un stream
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Identifiant du stream
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               enabled:
   *                 type: boolean
   *                 description: Activer (true) ou désactiver (false) le décodage matériel
   *                 example: true
   *             required:
   *               - enabled
   *     responses:
   *       200:
   *         description: Décodage matériel modifié avec succès
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: "Hardware decoding enabled for Flamby"
   *                 hardwareDecoding:
   *                   type: boolean
   *                   example: true
   *       400:
   *         description: Paramètres invalides
   *       404:
   *         description: Stream non trouvé
   *       500:
   *         description: Erreur lors de la modification du décodage matériel
   */

  // PATCH /api/streams/:id/hardware-decoding -> toggle hardware decoding
  if (req.method === 'PATCH' && /^\/api\/streams\/[^\/]+\/hardware-decoding$/.test(pathname)) {
    return parseJsonBody(req).then(async body => {
      const streamId = pathname.split('/')[3]; // extract ID from path
      const enabled = body.enabled;

      if (typeof enabled !== 'boolean') {
        return sendJson(res, 400, { success: false, error: 'enabled field is required and must be boolean' });
      }

      const streamIndex = streams.findIndex(s => s.id === streamId);
      if (streamIndex === -1) {
        return sendJson(res, 404, { success: false, error: 'Stream not found' });
      }

      const stream = streams[streamIndex];

      try {
        // Modifier le décodage matériel dans OBS
        const success = await toggleHardwareDecoding(stream.name, enabled);
        
        if (success) {
          const message = `Hardware decoding ${enabled ? 'enabled' : 'disabled'} for ${stream.name}`;
          logInfo(`[API] ${message}`);
          return sendJson(res, 200, { 
            success: true, 
            message: message,
            hardwareDecoding: enabled
          });
        } else {
          throw new Error('Failed to update hardware decoding in OBS');
        }
      } catch (error) {
        logError(`[API] Failed to toggle hardware decoding for ${stream.name}:`, error.message);
        return sendJson(res, 500, { success: false, error: error.message });
      }
    }).catch(() => sendJson(res, 400, { success: false, error: 'invalid json body' }));
  }

  /**
   * @swagger
   * /api/streams/{id}/chat:
   *   patch:
   *     tags:
   *       - Streams
   *     summary: Active/désactive l'affichage du chat
   *     description: Active ou désactive l'affichage du chat Twitch à côté de la source média dans OBS
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID du stream
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - enabled
   *             properties:
   *               enabled:
   *                 type: boolean
   *                 description: True pour afficher le chat, false pour le masquer
   *     responses:
   *       200:
   *         description: Chat modifié avec succès
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: "Chat enabled for Flamby"
   *                 chatEnabled:
   *                   type: boolean
   *                   example: true
   *       400:
   *         description: Paramètres invalides
   *       404:
   *         description: Stream non trouvé
   *       500:
   *         description: Erreur lors de la modification du chat
   */

  // PATCH /api/streams/:id/chat -> toggle chat display
  if (req.method === 'PATCH' && /^\/api\/streams\/[^\/]+\/chat$/.test(pathname)) {
    return parseJsonBody(req).then(async body => {
      const streamId = pathname.split('/')[3]; // extract ID from path
      const enabled = body.enabled;

      if (typeof enabled !== 'boolean') {
        return sendJson(res, 400, { success: false, error: 'enabled field is required and must be boolean' });
      }

      const streamIndex = streams.findIndex(s => s.id === streamId);
      if (streamIndex === -1) {
        return sendJson(res, 404, { success: false, error: 'Stream not found' });
      }

      const stream = streams[streamIndex];

      try {
        // Activer/désactiver le chat dans OBS
        const success = await toggleChatDisplay(stream, enabled);
        
        if (success) {
          const message = `Chat ${enabled ? 'enabled' : 'disabled'} for ${stream.name}`;
          logInfo(`[API] ${message}`);
          return sendJson(res, 200, { 
            success: true, 
            message: message,
            chatEnabled: enabled
          });
        } else {
          throw new Error('Failed to update chat display in OBS');
        }
      } catch (error) {
        logError(`[API] Failed to toggle chat display for ${stream.name}:`, error.message);
        return sendJson(res, 500, { success: false, error: error.message });
      }
    }).catch(() => sendJson(res, 400, { success: false, error: 'invalid json body' }));
  }

  if (pathname.startsWith('/api/streams/') && (req.method === 'PUT' || req.method === 'PATCH')) {
    const isAllowedPatch = req.method === 'PATCH' && (
      /^\/api\/streams\/[^\/]+\/quality$/.test(pathname) ||
      /^\/api\/streams\/[^\/]+\/hardware-decoding$/.test(pathname) ||
      /^\/api\/streams\/[^\/]+\/chat$/.test(pathname)
    );
    
    if (!isAllowedPatch) {
      return sendJson(res, 405, { success: false, error: 'start/stop not supported in new backend' });
    }
    // Si c'est un endpoint autorisé, on continue le traitement (ne pas return ici)
  }

  /**
   * @swagger
   * /api/zevent-streamers:
   *   get:
   *     tags:
   *       - ZEvent
   *     summary: Données complètes de l'API ZEvent
   *     description: Retourne les données complètes de l'API ZEvent en temps réel (streamers, donations, viewers, etc.)
   *     responses:
   *       200:
   *         description: Données ZEvent récupérées avec succès depuis l'API live
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 live:
   *                   type: array
   *                   description: Liste des streamers participants avec leurs statuts en temps réel
   *                   items:
   *                     type: object
   *                     properties:
   *                       twitch_id:
   *                         type: string
   *                         description: ID Twitch du streamer
   *                       display:
   *                         type: string
   *                         description: Nom d'affichage
   *                       twitch:
   *                         type: string
   *                         description: Nom d'utilisateur Twitch
   *                       online:
   *                         type: boolean
   *                         description: Statut en ligne
   *                       viewersAmount:
   *                         type: object
   *                         properties:
   *                           number:
   *                             type: number
   *                           formatted:
   *                             type: string
   *                       donationAmount:
   *                         type: object
   *                         properties:
   *                           number:
   *                             type: number
   *                           formatted:
   *                             type: string
   *                 donationAmount:
   *                   type: object
   *                   description: Montant total des donations
   *                 viewersCount:
   *                   type: object
   *                   description: Nombre total de viewers
   *                 calendar:
   *                   type: array
   *                   description: Événements du calendrier ZEvent
   *       500:
   *         description: Erreur lors de la récupération des données de l'API ZEvent
   */
  // GET /api/zevent-streamers -> retourne les données ZEvent depuis l'API live
  if (req.method === 'GET' && pathname === '/api/zevent-streamers') {
    try {
      const response = await fetch('https://zevent.fr/api/');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const json = await response.json();
      return sendJson(res, 200, { success: true, ...json });
    } catch (e) {
      return sendJson(res, 500, { success: false, error: 'Failed to fetch ZEvent data: ' + e.message });
    }
  }

  /**
   * @swagger
   * /api/zevent-stats:
   *   get:
   *     tags:
   *       - ZEvent
   *     summary: Statistiques calculées du ZEvent en temps réel
   *     description: Retourne les statistiques globales calculées à partir des données ZEvent live (streamers en ligne, viewers totaux, donations, top streamer)
   *     responses:
   *       200:
   *         description: Statistiques ZEvent calculées avec succès depuis l'API live
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 stats:
   *                   type: object
   *                   properties:
   *                     streamersOnline:
   *                       type: number
   *                       description: Nombre de streamers actuellement en ligne
   *                       example: 127
   *                     totalStreamers:
   *                       type: number
   *                       description: Nombre total de streamers participants au ZEvent
   *                       example: 341
   *                     totalViewers:
   *                       type: string
   *                       description: Nombre total de viewers (formaté avec séparateurs)
   *                       example: "1,234,567"
   *                     totalDonations:
   *                       type: number
   *                       description: Montant total des donations en euros
   *                       example: 1500000
   *                     topStreamer:
   *                       type: object
   *                       description: Streamer avec le plus de viewers
   *                       properties:
   *                         name:
   *                           type: string
   *                           description: Nom d'affichage du top streamer
   *                           example: "ZeratoR"
   *                         viewers:
   *                           type: string
   *                           description: Nombre de viewers (formaté)
   *                           example: "50,000"
   *       500:
   *         description: Erreur lors du calcul des statistiques ou de la récupération des données ZEvent
   */
  // GET /api/zevent-stats -> statistiques calculées ZEvent
  if (req.method === 'GET' && pathname === '/api/zevent-stats') {
    try {
      // Utiliser l'API en direct comme getZEventStreamers()
      const response = await fetch('https://zevent.fr/api/');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const json = await response.json();
      
      if (!json.live || !Array.isArray(json.live)) {
        return sendJson(res, 500, { success: false, error: 'Invalid ZEvent data format' });
      }

      const data_streamers = json.live;

        // Calcul des statistiques
        const streamersOnline = data_streamers.filter(streamer => streamer.online === true).length;
        const totalStreamers = data_streamers.length;

        // Total des viewers (seulement les streamers en ligne)
        const totalViewersNumber = data_streamers
          .filter(streamer => streamer.online === true)
          .reduce((sum, streamer) => sum + (streamer.viewersAmount?.number || 0), 0);
        const totalViewers = totalViewersNumber.toLocaleString();

        // Total des donations
        const totalDonations = data_streamers.reduce((sum, streamer) => sum + (streamer.donationAmount?.number || 0), 0);

        // Top streamer (parmi ceux qui sont en ligne)
        const onlineStreamers = data_streamers.filter(streamer => streamer.online === true);
        let topStreamer = { name: 'N/A', viewers: '0' };
        
        if (onlineStreamers.length > 0) {
          const top = onlineStreamers.reduce((best, current) => {
            const currentViewers = current.viewersAmount?.number || 0;
            const bestViewers = best.viewersAmount?.number || 0;
            const currentDonations = current.donationAmount?.number || 0;
            const bestDonations = best.donationAmount?.number || 0;
            
            if (currentViewers > bestViewers) {
              return current;
            } else if (currentViewers === bestViewers && currentDonations > bestDonations) {
              return current;
            }
            return best;
          }, onlineStreamers[0]);
          
          topStreamer = {
            name: top.display || 'N/A',
            viewers: top.viewersAmount?.formatted || '0'
          };
        }

        const stats = {
          streamersOnline,
          totalStreamers,
          totalViewers,
          totalDonations,
          topStreamer
        };

        return sendJson(res, 200, { success: true, stats });
        
    } catch (e) {
      return sendJson(res, 500, { success: false, error: 'Failed to fetch ZEvent data: ' + e.message });
    }
  }

  /**
   * @swagger
   * /api/obs/status:
   *   get:
   *     tags:
   *       - OBS
   *     summary: Statut de la connexion OBS WebSocket
   *     description: Retourne le statut de la connexion à OBS Studio via WebSocket, incluant les informations de version et la scène actuelle si connecté
   *     responses:
   *       200:
   *         description: Statut OBS récupéré avec succès
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 status:
   *                   type: object
   *                   properties:
   *                     connected:
   *                       type: boolean
   *                       description: Indique si la connexion OBS est active
   *                       example: true
   *                     enabled:
   *                       type: boolean
   *                       description: Indique si OBS WebSocket est activé dans la configuration
   *                       example: true
   *                     url:
   *                       type: string
   *                       description: URL de connexion OBS WebSocket
   *                       example: "ws://localhost:4455"
   *                     reconnectAttempts:
   *                       type: number
   *                       description: Nombre de tentatives de reconnexion effectuées
   *                       example: 0
   *                     maxReconnectAttempts:
   *                       type: number
   *                       description: Nombre maximum de tentatives de reconnexion
   *                       example: 10
   *                     obsVersion:
   *                       type: string
   *                       description: Version d'OBS Studio (si connecté)
   *                       example: "31.1.1"
   *                     webSocketVersion:
   *                       type: string
   *                       description: Version du plugin WebSocket OBS (si connecté)
   *                       example: "5.6.2"
   *                     currentScene:
   *                       type: string
   *                       description: Nom de la scène actuellement active (si connecté)
   *                       example: "Scène"
   *       500:
   *         description: Erreur lors de la récupération du statut OBS
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 error:
   *                   type: string
   *                   example: "Failed to get OBS status"
   */

  /**
   * /api/obs:
   */
  
  // GET /api/obs/status -> statut de la connexion OBS
  if (req.method === 'GET' && pathname === '/api/obs/status') {
    try {
      const status = {
        connected: isObsConnected,
        enabled: OBS_CONFIG.enabled,
        url: OBS_CONFIG.url,
        reconnectAttempts: obsReconnectAttempts,
        maxReconnectAttempts: OBS_CONFIG.maxReconnectAttempts
      };
      
      if (isObsConnected) {
        try {
          const version = await obs.call('GetVersion');
          const currentScene = await getCurrentOBSScene();
          status.obsVersion = version.obsVersion;
          status.webSocketVersion = version.obsWebSocketVersion;
          status.currentScene = currentScene;
        } catch (e) {
          logDebug('[OBS] Could not get additional status info:', e.message);
        }
      }
      
      return sendJson(res, 200, { success: true, status });
    } catch (error) {
      logError('[OBS] Failed to get status:', error.message);
      return sendJson(res, 500, { success: false, error: 'Failed to get OBS status' });
    }
  }

  // GET /api/obs/diagnose -> diagnostic des collections OBS
  if (req.method === 'GET' && pathname === '/api/obs/diagnose') {
    try {
      logInfo('[API] OBS collection diagnosis requested');
      const diagnosisResult = await diagnoseObsCollections();
      
      return sendJson(res, 200, { 
        success: true, 
        diagnosis: diagnosisResult,
        message: 'Diagnosis completed - check server logs for detailed results'
      });
    } catch (error) {
      logError('[OBS] Failed to diagnose collections:', error.message);
      return sendJson(res, 500, { 
        success: false, 
        error: 'Failed to diagnose OBS collections' 
      });
    }
  }

  // GET /api/obs/diagnose-scenes -> diagnostic des scènes pour un streamer
  if (req.method === 'GET' && pathname === '/api/obs/diagnose-scenes') {
    const streamerName = parsedUrl.searchParams.get('streamer');
    if (!streamerName) {
      return sendJson(res, 400, { success: false, error: 'Missing streamer parameter' });
    }
    
    try {
      logInfo(`[API] OBS scenes diagnosis requested for: ${streamerName}`);
      await diagnoseOBSScenes(streamerName);
      
      return sendJson(res, 200, { 
        success: true, 
        message: `Diagnosis completed for ${streamerName} - check server logs for detailed results`
      });
    } catch (error) {
      logError(`[OBS] Failed to diagnose scenes for ${streamerName}:`, error.message);
      return sendJson(res, 500, { 
        success: false, 
        error: `Failed to diagnose scenes for ${streamerName}` 
      });
    }
  }

  /**
   * @swagger
   * /api/obs/fix-media-bounds:
   *   post:
   *     tags:
   *       - OBS
   *     summary: Corriger les bounds d'une source média
   *     description: Corrige la configuration des bounds d'une source média pour éviter les problèmes de zoom lors des publicités ou écrans d'attente en résolution différente. Configure la source pour maintenir les bonnes proportions dans les limites du canvas OBS.
   *     parameters:
   *       - in: query
   *         name: streamer
   *         required: true
   *         schema:
   *           type: string
   *         description: Nom du streamer dont la source média doit être corrigée
   *     responses:
   *       200:
   *         description: Bounds de la source média corrigés avec succès
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *       400:
   *         description: Paramètre streamer manquant
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 error:
   *                   type: string
   *                   example: "Missing streamer parameter"
   *       500:
   *         description: Erreur lors de la correction des bounds
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 error:
   *                   type: string
   */

  // POST /api/obs/fix-media-bounds -> corriger les bounds des sources média
  if (req.method === 'POST' && pathname === '/api/obs/fix-media-bounds') {
    const streamerName = parsedUrl.searchParams.get('streamer');
    if (!streamerName) {
      return sendJson(res, 400, { success: false, error: 'Missing streamer parameter' });
    }
    
    try {
      logInfo(`[API] Fixing media bounds requested for: ${streamerName}`);
      const success = await updateMediaSourceBounds(streamerName);
      
      if (success) {
        return sendJson(res, 200, { 
          success: true, 
          message: `Media bounds fixed for ${streamerName}` 
        });
      } else {
        return sendJson(res, 500, { 
          success: false, 
          error: `Failed to fix media bounds for ${streamerName}` 
        });
      }
    } catch (error) {
      logError(`[OBS] Failed to fix media bounds for ${streamerName}:`, error.message);
      return sendJson(res, 500, { 
        success: false, 
        error: `Failed to fix media bounds for ${streamerName}` 
      });
    }
  }

  return sendJson(res, 404, { success: false, error: 'not found' });
}

function startServer(port = DEFAULT_PORT) {
  const srv = http.createServer(async (req, res) => {
    // Add CORS headers for browser-based frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const fullUrl = `http://localhost${req.url}`;
    const parsedUrl = new URL(fullUrl);
    // keep legacy /get-url for quick testing
    if (parsedUrl.pathname === '/get-url' && req.method === 'GET') {
      const streamer = parsedUrl.searchParams.get('streamer') || '';
      const quality = parsedUrl.searchParams.get('quality') || 'best';
      if (!streamer) return sendJson(res, 400, { error: 'missing streamer query param' });
      return getStreamUrl(streamer, quality, (err, m3u8) => {
        if (err) return sendJson(res, 500, { error: err.message });
        return sendJson(res, 200, { url: m3u8 });
      });
    }

    // Documentation Swagger
    if (req.method === 'GET' && parsedUrl.pathname === '/docs') {
      // Utilise directement le HTML intégré de Swagger UI avec CDN
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ZEvent Streamlink API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.0.0/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin:0; background: #fafafa; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.0.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.0.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '/docs/swagger.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(html);
    }

    // Swagger JSON spec
    if (req.method === 'GET' && parsedUrl.pathname === '/docs/swagger.json') {
      return sendJson(res, 200, swaggerSpec);
    }

    // Health check endpoint
    if (req.method === 'GET' && parsedUrl.pathname === '/health') {
      try {
        const startTime = Date.now();
        
        const services = {
          twitch_api: 'healthy',
          zevent_api: 'healthy',
          streamlink: 'healthy',
          obs_websocket: OBS_CONFIG.enabled ? (isObsConnected ? 'healthy' : 'unhealthy') : 'disabled'
        };

        try {
          const twitchToken = await getTwitchAppToken();
          if (!twitchToken) {
            services.twitch_api = 'unhealthy';
          }
        } catch (error) {
          services.twitch_api = 'unhealthy';
        }

        // Test ZEvent API
        try {
          await getZEventStreamers();
        } catch (error) {
          services.zevent_api = 'degraded';
        }

        // Test Streamlink (vérification simple de la commande)
        try {
          const { exec } = require('child_process');
          await new Promise((resolve, reject) => {
            exec('streamlink --version', { timeout: 5000 }, (error) => {
              if (error) reject(error);
              else resolve();
            });
          });
        } catch (error) {
          services.streamlink = 'unhealthy';
        }

        if (OBS_CONFIG.enabled) {
          if (isObsConnected) {
            services.obs_websocket = 'healthy';
          } else if (obsReconnectAttempts < OBS_CONFIG.maxReconnectAttempts) {
            services.obs_websocket = 'degraded';
          } else {
            services.obs_websocket = 'unhealthy';
          }
        } else {
          services.obs_websocket = 'disabled';
        }

        // Calculer les stats
        const activeStreams = streams.filter(s => s.liveStatus?.online).length;
        
        // Déterminer le statut global
        const hasUnhealthy = Object.values(services).includes('unhealthy');
        const hasDegraded = Object.values(services).includes('degraded');
        
        let status = 'healthy';
        let statusCode = 200;
        
        if (hasUnhealthy) {
          status = 'unhealthy';
          statusCode = 503;
        } else if (hasDegraded) {
          status = 'degraded';
          statusCode = 200;
        }

        const healthData = {
          status,
          timestamp: new Date().toISOString(),
          uptime: Math.floor(process.uptime()),
          response_time: Date.now() - startTime,
          services,
          stats: {
            total_streams: streams.length,
            active_streams: activeStreams
          }
        };

        logApi(req.method, parsedUrl.pathname, statusCode, `${status} (${Date.now() - startTime}ms)`);
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthData, null, 2));
        return;
      } catch (error) {
        logError('Erreur health check:', error);
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: 'Internal server error'
        }, null, 2));
        return;
      }
    }

    if (parsedUrl.pathname && parsedUrl.pathname.startsWith('/api/')) {
      return handleApi(req, res);
    }

    res.statusCode = 404;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('Not Found');
  });

  srv.listen(port, () => {
    const asciiLogo = [
      '\x1b[36m',
      "  ______________      ________ _   _ _______     _____ _                            _ _       _    ",
      " |___  /  ____\\ \\    / /  ____| \\ | |__   __|   / ____| |                          | (_)     | |   ",
      "    / /| |__   \\ \\  / /| |__  |  \\| |  | |_____| (___ | |_ _ __ ___  __ _ _ __ ___ | |_ _ __ | | __",
      "   / / |  __|   \\ \\/ / |  __| | . ` |  | |______\\___ \\| __| '__/ _ \\/ _` | '_ ` _ \\| | | '_ \\| |/ /",
      "  / /__| |____   \\  /  | |____| |\\  |  | |      ____) | |_| | |  __/ (_| | | | | | | | | | | | |   < ",
      " /_____|______|   \\/   |______|_| \\_|  |_|     |_____/ \\__|_|  \\___|\\__,_|_| |_| |_|_|_|_| |_|_|\\_\\",
      '\x1b[0m'
    ].join('\n');
    logAlways(asciiLogo);
    logAlways(`\x1b[32m[API]\x1b[0m listening on http://localhost:${port}`);
    
    updateStreamsZEventInfo().catch(e => {
      logError('[ZEvent] Failed to update stream info:', e.message);
    });
    
    // Démarrage du monitoring des streams (alternative à EventSub)
    startStreamStatusMonitoring();
    
    // Initialisation de la connexion OBS WebSocket
    if (OBS_CONFIG.enabled) {
      logAlways(`\x1b[36m[OBS]\x1b[0m 🚀 Initializing OBS WebSocket connection...`);
      logInfo(`[OBS] 🔧 Configuration: URL=${OBS_CONFIG.url}, Password=${OBS_CONFIG.password ? 'SET' : 'NOT_SET'}`);
      connectToOBS().catch(e => {
        logError('[OBS] ❌ Failed to initialize OBS connection:', e.message);
      });
    } else {
      logAlways(`\x1b[33m[OBS]\x1b[0m 🔴 OBS WebSocket integration is disabled`);
      logInfo('[OBS] To enable OBS integration, set OBS_WEBSOCKET_ENABLED=true in .env');
    }
  });


  return srv;
}


// CLI mode: node backend/server.js <streamer>
if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.length >= 1) {
    const streamer = argv[0];
    getStreamUrl(streamer, (err, url) => {
      if (err) {
  logError('error:', err.message);
        process.exitCode = 1;
        return;
      }
  logAlways(url);
    });
  } else {
    const port = process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT;
    startServer(port);
  }
}

module.exports = { getStreamUrl, startServer };
