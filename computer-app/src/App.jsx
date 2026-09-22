import React, { useState, useEffect, useRef, } from 'react'
import UserContext from './Context'
import Footer from './components/Footer';
import Dragdrop from './components/Dragdrop';
import MyComputer from './components/MyComputer';
import ProjectFolder from './components/ProjectFolder';
import Shutdown from './components/Shutdown';
import MineSweeper from './components/MineSweeper'
import MsnFolder from './components/MsnFolder';
import iconInfo from './icon.json'
import { apiService } from './services/apiService';
import Login from './components/Login';
import OpenProject from './components/OpenProject';
import WindowsShutdown from './components/WindowsShutdown';
import BgSetting from './components/BgSetting';
import Run from './components/Run';
import Notification from './components/Notification';
import EmptyFolder from './components/EmptyFolder';
import ErrorBtn from './components/ErrorBtn';
import RightClickWindows from './components/RightClickWindows';
import loadingSpin from './assets/loading.gif'
import Patch from './components/Patch';
import UploadApp from './components/UploadApp';
import TaskManager from './components/TaskManager';
import {
  StyleHide, imageMapping,
  handleDoubleClickiframe,
  iconContainerSize, iconImgSize, iconTextSize,
  handleDoubleClickPhotoOpen,
} from './components/function/AppFunctions';


function App() {
  const [backTrackIe, setBackTrackIe] = useState([]);
  const [forwardTrackIe, setForwardTrackIe] = useState([]);
  const [currentRightClickFolder, setCurrentRightClickFolder] = useState('Desktop')
  const [ringMsn, setRingMsn] = useState(false)
  const [keyRef, setKeyRef] = useState(0)
  const [localBg, setLocalBg] = useState(() => {
    const prevBg = localStorage.getItem('background')
    return prevBg ? prevBg : null
  })
  const [localEffect, setLocalEffect] = useState(() => {
    const prevEffect = localStorage.getItem('effect')
    return prevEffect ? prevEffect : null
  })
  const [websocketConnection, setWebsocketConnection] = useState(true)
  const [chatBotActive, setChatBotActive] = useState(false);
  const onlineUser = 0 // nothing counts the visitors online yet
  const [deleteIcon, setDeleteIcon] = useState(0)
  const refBeingClicked = useRef(null)
  const maxZindexRef = useRef(2);
  const [inFolder, setInFolder] = useState('')
  const [refresh, setRefresh] = useState(0)
  const timerRef = useRef(null); // time counter for long press
  const [binRestoreArr, setBinRestoreArr] = useState(() => {
    const getRestoreArr = localStorage.getItem('restoreArray');
    return getRestoreArr ? JSON.parse(getRestoreArr) : [];
  });
  const [rightClickBin, setRightClickBin] = useState(false) // right click icon in bin folder
  const [iconBeingRightClicked, setIconBeingRightClicked] = useState({}); // right click Icon
  const [rightClickIcon, setRightClickIcon] = useState(false); // right click Icon
  const [rightClickDefault, setRightClickDefault] = useState(false); // right click bg
  const [rightClickPosition, setRightClickPosition] = useState({ x: 0, y: 0 });
  const [loadedMessages, setLoadedMessages] = useState([]);
  const [currentPhoto, setCurrentPhoto] = useState({});
  const [regErrorPopUp, setRegErrorPopUp] = useState(false)
  const [regErrorPopUpVal, setRegErrorPopUpVal] = useState('')
  const [runItemBox, setRunItemBox] = useState(false)
  const [RunInputVal, setRunInputVal] = useState('')
  const [undo, setUndo] = useState(['MyComputer'])
  const [selectedFolder, setSelectedFolder] = useState({ label: 'MyComputer', img: imageMapping('MyComputer') })
  const [currentFolder, setCurrentFolder] = useState('MyComputer')
  const [loading, setLoading] = useState(true)
  const [projectStartBar, setProjectStartBar] = useState(false)
  const [calenderToggle, setCalenderToggle] = useState(false)
  const [iconScreenSize, setIconScreenSize] = useState(() => {
    const savedIconSize = localStorage.getItem('iconSize');
    return savedIconSize ? Number(savedIconSize) : 0
  });
  const [iconSize, setIconSize] = useState(false)
  const [notiOn, setNotiOn] = useState(false);
  const [key, setKey] = useState(0)
  const [dragging, setDragging] = useState(false)
  const DesktopRef = useRef(null);
  const ProjectFolderRef = useRef(null);
  const BinRef = useRef(null);
  const DiskRef = useRef(null);
  const PictureRef = useRef(null)
  const UtilityRef = useRef(null)
  const [dropTargetFolder, setDropTargetFolder] = useState(null);
  const [reMountRun, setReMountRun] = useState(0)
  const [ErrorPopup, setErrorPopup] = useState(false)
  const [themeDragBar, setThemeDragBar] = useState(() => localStorage.getItem('barcolor') || '#14045c')
  const [login, setLogin] = useState(true)
  const [windowsShutDownAnimation, setWindowsShutDownAnimation] = useState(false)
  const endOfMessagesRef = useRef(null);
  const [userNameValue, setUserNameValue] = useState(() => {
    return localStorage.getItem('username') || '';
  });
  const [chatValue, setChatValue] = useState('')
  const [chatData, setChatData] = useState([])
  const [shutdownWindow, setShutdownWindow] = useState(false)
  const ClearTOdonttouch = useRef(null);
  const ClearTOclippyUsernameFunction = useRef(null);
  const firstTimoutShowclippy = useRef(null);
  const RandomTimeoutShowClippy = useRef(null);
  const SecondRandomTimeoutShowClippy = useRef(null);
  const [clippyUsername, setClippyUsername] = useState(false)
  const [clippyTouched, setClippyTouched] = useState(false)
  const [randomClippyPopup, setRandomClippyPopup] = useState(false)
  const [clippyIndex, setClippyIndex] = useState(0)
  const [showClippy, setShowClippy] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [startActive, setStartActive] = useState(false);
  const [time, setTime] = useState('');
  const [tap, setTap] = useState([])

  /* -------------------------------------------------------------------------- */
  /*                                 WEBSOCKET                                  */
  /* -------------------------------------------------------------------------- */
  const wsRef = useRef(null);

  const connectWebSocket = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    // Connect to the same host but with /ws path (proxied by Nginx)
    const wsUrl = `${protocol}//${host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to WebSocket');
      setWebsocketConnection(true);
      setLoading(false);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'history') {
          setChatData(message.data);
        } else if (message.type === 'message') {
          setChatData(prev => [...prev, message.data]);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setWebsocketConnection(false);
      wsRef.current = null;
      // Auto-reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setLoading(false);
      ws.close();
    };
  };

  useEffect(() => {
    connectWebSocket();
    return () => {
      wsRef.current?.close();
    };
  }, []);
  /* -------------------------------------------------------------------------- */
  const [lastTapTime, setLastTapTime] = useState(0)
  const [projectUrl, setProjectUrl] = useState('')
  const [ProjectExpand, setProjectExpand] = useState(
    {
      expand: false, show: false, hide: false, focusItem: true,  // focusItem is window, item_1focus - 5 is the icon
      x: 0, y: 0, zIndex: 1,
    });

  const [openProjectExpand, setOpenProjectExpand] = useState(
    { expand: false, show: false, hide: false, focusItem: true, x: 0, y: 0, zIndex: 1, });

  const [MyComputerExpand, setMyComputerExpand] = useState(
    { expand: false, show: false, hide: false, focusItem: true, x: 0, y: 0, zIndex: 1, });

  const [pictureExpand, setPictureExpand] = useState(
    { expand: false, show: false, hide: false, focusItem: true, x: 0, y: 0, zIndex: 1, });

  const [photoOpenExpand, setPhotoOpenExpand] = useState(
    { expand: false, show: false, hide: false, focusItem: true, x: 0, y: 0, zIndex: 1, });

  const [desktopIcon, setDesktopIcon] = useState(() => {
    const localItems = localStorage.getItem('icons');

    const parsedItems = localItems ? JSON.parse(localItems) : iconInfo;


    return parsedItems;
  });

  const [MineSweeperExpand, setMineSweeperExpand] = useState(
    { expand: false, show: false, hide: false, focusItem: true, x: 0, y: 0, zIndex: 1, });

  const [MSNExpand, setMSNExpand] = useState(
    { expand: false, show: false, hide: false, focusItem: true, x: 0, y: 0, zIndex: 1, });

  const [BgSettingExpand, setBgSettingExpand] = useState(
    { expand: false, show: false, hide: false, focusItem: true, x: 0, y: 0, zIndex: 1, });

  const [RunExpand, setRunExpand] = useState(
    { expand: false, show: false, hide: false, focusItem: true, x: 0, y: 0, zIndex: 1, });

  const [BinExpand, setBinExpand] = useState(
    { expand: false, show: false, hide: false, focusItem: true, x: 0, y: 0, zIndex: 1, });

  const [PaintExpand, setPaintExpand] = useState(
    { expand: false, show: false, hide: false, focusItem: true, x: 0, y: 0, zIndex: 1, });

  const [UtilityExpand, setUtilityExpand] = useState(
    { expand: false, show: false, hide: false, focusItem: true, x: 0, y: 0, zIndex: 1, });

  const [PatchExpand, setPatchExpand] = useState(
    { expand: false, show: false, hide: false, focusItem: false, x: 0, y: 0, zIndex: 1, });

  const [TaskManagerExpand, setTaskManagerExpand] = useState(
    { expand: false, show: false, hide: false, focusItem: true, x: 0, y: 0, zIndex: 1, });

  const [UploadExpand, setUploadExpand] = useState(
    { expand: false, show: false, hide: false, focusItem: true, x: 0, y: 0, zIndex: 1, });

  const [UserCreatedFolder, setUserCreatedFolder] = useState(() => {
    const localFolders = localStorage.getItem('userFolders');
    const parsed = localFolders ? JSON.parse(localFolders) : [];
    return parsed.map(folder => ({
      ...folder,
      id: folder.id || null,
      expand: false,
      show: false,
      hide: false,
      focusItem: false,
      x: 0,
      y: 0,
      zIndex: 1,
    }));
  });

  const UserCreatedFolderRef = useRef([]);

  useEffect(() => { // REF for user created folder
    // Ensure refs array matches folders
    UserCreatedFolderRef.current = UserCreatedFolder.map(
      (_, i) => UserCreatedFolderRef.current[i] || React.createRef()
    );
  }, [UserCreatedFolder]);



  const allPicture = desktopIcon.filter(picture => picture.type === '.jpeg'); // photo open

  const textError = ( // error message
    <>
      Cannot find the file '{RunInputVal || regErrorPopUpVal}' (or one of its component).
      Make sure the path and filename are correct and that all required
      libraries are available.
    </>
  )

  function projectname() { // project name 
    if (projectUrl.length < 1) return;

    const projectlinkletter = projectUrl.slice(8).split('.')[0];

    return projectlinkletter[0].toUpperCase() + projectlinkletter.slice(1);
  }

  // Define all state setter functions and corresponding clear functions in an array
  const allSetters = [setClippyUsername];
  const allClears = [ClearTOclippyUsernameFunction];

  useEffect(() => { // force user to update version by clearing their local storage!
    if (!desktopIcon.find(icon => icon.name === 'Paint')) {
      localStorage.clear();
      location.reload();
    }

    // Explicitly close Patch window on mount
    setPatchExpand(prev => ({ ...prev, show: false, expand: false, hide: true }));
  }, [])


  useEffect(() => {
    const handleRightClick = (e) => {
      e.preventDefault();

      const iconRect = refBeingClicked.current?.getBoundingClientRect();
      setRightClickPosition({ x: e.clientX, y: e.clientY });

      const isIconRef =
        e.clientX > iconRect?.left &&
        e.clientX < iconRect?.right &&
        e.clientY > iconRect?.top &&
        e.clientY < iconRect?.bottom;

      if (!isIconRef) {
        setRightClickBin(false);
        setRightClickIcon(false);
      }

      setRightClickDefault(true);
    };

    document.addEventListener("contextmenu", handleRightClick);

    return () => {
      document.removeEventListener("contextmenu", handleRightClick);
    };
  }, []);


  useEffect(() => {
    const handleTouchStart = (e) => {

      if (dragging) return; // Prevent duplicate triggers

      timerRef.current = setTimeout(() => {
        setRightClickPosition({ x: e.touches[0].clientX, y: e.touches[0].clientY });
        setRightClickDefault(true);
      }, 800); // 800ms long press threshold
    };

    const handleTouchEnd = () => {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    };

    document.addEventListener("touchstart", handleTouchStart);
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchmove", handleTouchEnd); // Cancel if moved
    document.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchmove", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, []);


  function handleMobileLongPress(e, icon) { // long press icon on mobile
    if (dragging) return;
    timerRef.current = setTimeout(() => {
      setRightClickPosition({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setRightClickBin(false)
      setRightClickIcon(true);
      setIconBeingRightClicked(icon);
      setRightClickDefault(true);

    }, 800)
  }

  function handleMobileLongPressBin(e, icon) { // long press icon on mobile
    if (dragging) return;
    timerRef.current = setTimeout(() => {
      setRightClickPosition({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setRightClickIcon(false);
      setRightClickBin(true)
      setIconBeingRightClicked(icon);
      setRightClickDefault(true);
    }, 800)
  }





  useEffect(() => {
    const handleInteraction = (e) => {
      if (e.button === 0 && !document.querySelector(".window_rightclick_container")?.contains(e.target)) {
        setRightClickDefault(false);
        setRightClickIcon(false)
        setRightClickBin(false)
        setIconBeingRightClicked({})
      }
    };

    const handleInteractionMobile = (e) => {
      if (rightClickDefault && !document.querySelector(".window_rightclick_container")?.contains(e.target)) {
        setRightClickDefault(false);
        setRightClickIcon(false)
        setRightClickBin(false)
        setIconBeingRightClicked({})
      }
    };

    document.addEventListener("mousedown", handleInteraction);
    document.addEventListener("touchstart", handleInteractionMobile);

    return () => {
      document.removeEventListener("mousedown", handleInteraction);
      document.removeEventListener("touchstart", handleInteractionMobile);
    };
  }, [rightClickDefault]);






  // WebSocket and Chat connectivity removed

  // Fetch file list from backend on mount
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const data = await apiService.getFiles();
        if (data && data.files) {
          setDesktopIcon(prev => {
            // Robust Sync & Icon Update:
            // 1. Identify valid backend IDs (ensure string comparison)
            const backendFileMap = new Map(data.files.map(f => [String(f.id), f]));

            // 2. Helper for Icon Mapping
            const getIconType = (filename) => {
              if (!filename) return { pic: 'NotePad', type: 'file' };
              const ext = filename.split('.').pop().toLowerCase();
              if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return { pic: 'Jpeg', type: '.jpeg' };
              if (['txt', 'md', 'json', 'js', 'css'].includes(ext)) return { pic: 'NotePad', type: 'notepad' };
              if (['mp3', 'wav'].includes(ext)) return { pic: 'Winamp', type: 'mp3' };
              if (['exe'].includes(ext)) return { pic: 'Project', type: '.exe' };
              return { pic: 'NotePad', type: 'file' };
            };

            // 3. Process existing state:
            //    - Keep system icons (no id)
            //    - Update backend files with fresh metadata (name, size) AND fresh icon mapping
            //    - Preserve position (x, y) and focus from local state
            //    - Remove orphans (items with id not in backend)

            const updatedState = prev.map(icon => {
              // System icon -> keep as is
              if (!icon.id) return icon;

              // Backend file -> check if it still exists
              const backendFile = backendFileMap.get(String(icon.id));
              if (backendFile) {
                // Update metadata & icon, preserve position
                // Respect backend type if it is 'folder'
                let { pic, type } = getIconType(backendFile.name);

                if (backendFile.type === 'folder') {
                  type = 'folder';
                  pic = 'Project'; // Standard folder icon
                }

                // Remove from map so we know it's handled
                backendFileMap.delete(String(icon.id));

                return {
                  ...icon, // keep x, y, focus
                  ...backendFile, // update name, size, folder, id causes no harm
                  pic: pic,   // FORCE update icon
                  type: type, // FORCE update type
                };
              }

              // Orphan -> mark for removal
              return null;
            }).filter(Boolean); // Remove nulls (orphans)

            // 4. Add NEW files (remaining in map)
            const newFiles = Array.from(backendFileMap.values()).map(file => {
              let { pic, type } = getIconType(file.name);

              if (file.type === 'folder') {
                type = 'folder';
                pic = 'Project';
              }

              return {
                ...file,
                id: file.id,
                name: file.name,
                type: type,
                pic: pic,
                folderId: file.folder || 'My Documents',
                focus: false,
                size: Math.round(file.size / 1024), // KB
              };
            });

            const finalState = [...updatedState, ...newFiles];

            // Sync UserCreatedFolder with backend folders
            setUserCreatedFolder(prevFolders => {
              // Only sync folders that have an ID (system folders like 'Project' are handled separately and have no ID)
              const backendFolders = finalState.filter(item => item.type === 'folder' && item.id);

              // 1. Identify valid IDs from backend
              const validIds = new Set(backendFolders.map(f => f.id));

              // 2. Filter OUT stale folders (remove anything in local state that isn't in backend)
              // This fixes the 'duplicate Project folder' issue by removing the accidental 'Project' entry
              const keptFolders = prevFolders.filter(f => validIds.has(f.id));

              // 3. Add NEW folders
              const currentFolderIds = new Set(keptFolders.map(f => f.id));
              const newFolderStates = backendFolders
                .filter(folder => !currentFolderIds.has(folder.id))
                .map(folder => ({
                  id: folder.id,
                  name: folder.name,
                  expand: false,
                  show: false,
                  hide: false,
                  focusItem: false,
                  x: 0,
                  y: 0,
                  zIndex: 1,
                }));

              return [...keptFolders, ...newFolderStates];
            });

            return finalState;
          });
        }
      } catch (error) {
        console.error('Failed to fetch files from backend', error);
      }
    };

    fetchFiles();
  }, []);




  useEffect(() => { // touch support device === true
    iconFocusIcon('') // make icon focus goes false

    const onTouchStartSupported = 'ontouchstart' in document.documentElement;
    setIsTouchDevice(onTouchStartSupported);

    document.addEventListener('gesturestart', function (e) { // prevent zooming on mobile
      e.preventDefault();
    });

    function handleKeyPress(event) { // hitting windows button activates start menu
      if (event.keyCode === 91 || event.keyCode === 92 || event.keyCode === 93) {
        setStartActive(prev => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };

  }, []);


  // Called on every move of a dragged icon: points dropTargetFolder at the open
  // window under the icon, or clears it. Folder icons are matched by the component
  // doing the drag, which calls this first and overrides the result on a hit.
  const handleOnDrag = (name, ref) => () => {
    setDragging(true)
    if (!ref || name === 'MyComputer' || name === 'RecycleBin') return;

    const windows = [
      ...UserCreatedFolder.map((folder, i) => [folder.name, UserCreatedFolderRef.current[i]?.current]),
      ['Utility', UtilityRef.current],
      ['RecycleBin', BinRef.current],
      ['Picture', PictureRef.current],
      ['Project', ProjectFolderRef.current],
      ['MyComputer', DiskRef.current],
    ];

    // The topmost element under the icon's centre, the icon itself aside. Closed
    // windows are display: none and minimised ones pointer-events: none, so neither
    // is ever hit, and of two overlapping windows the one in front wins.
    const iconRect = ref.getBoundingClientRect();
    const hit = document
      .elementsFromPoint(iconRect.left + iconRect.width / 2, iconRect.top + iconRect.height / 2)
      .find(el => !ref.contains(el));
    const [folder] = windows.find(([, el]) => el && hit && el.contains(hit)) || [];

    if (!folder || folder === name) {
      setDropTargetFolder('');
    } else if (folder === 'MyComputer') {
      // My Computer shows whichever folder it is browsing; its root holds only drives.
      const validFolders = ['DiskC', 'DiskD', 'Project', 'Picture', 'RecycleBin', 'Utility', ...UserCreatedFolder.map(item => item.name)];
      setDropTargetFolder(validFolders.includes(currentFolder) && currentFolder !== name ? currentFolder : '');
    } else {
      setDropTargetFolder(folder);
    }
  };

  function handleShowInfolder(name, type) { //important handleshow for in folder

    setRightClickDefault(false);

    //  const lowerCaseName = name.toLowerCase().split(' ').join('');

    if (name === 'Hard Disk (C:)') {
      setCurrentFolder('DiskC')
      setSelectedFolder({ label: 'Hard Disk (C:)', img: imageMapping(name) })
      setUndo(prev => [...prev, 'DiskC'])
      return;
    }

    if (name === 'Hard Disk (D:)') {
      setCurrentFolder('DiskD')
      setSelectedFolder({ label: 'Hard Disk (D:)', img: imageMapping(name) })
      setUndo(prev => [...prev, 'DiskD'])
      return;
    }

    if (name === 'Project') {
      setCurrentFolder('Project')
      setSelectedFolder({ label: 'Project', img: imageMapping(name) })
      setUndo(prev => [...prev, 'Project'])
      return;
    }

    if (name === 'Picture') {
      setCurrentFolder('Picture')
      setSelectedFolder({ label: 'Picture', img: imageMapping(name) })
      setUndo(prev => [...prev, 'Picture'])
      return;
    }

    if (name === 'Utility') {
      setCurrentFolder('Utility')
      setSelectedFolder({ label: 'Utility', img: imageMapping(name) })
      setUndo(prev => [...prev, 'Utility'])
      return;
    }


    if (type === 'folder') {
      setCurrentFolder(name)
      setSelectedFolder({ label: name, img: imageMapping('Project') })
      setUndo(prev => [...prev, name])
      return;
    }

    handleShow(name)
  }

  function handleShowInfolderMobile(name, type) { //important handleshow for in folder

    setRightClickDefault(false);

    const now = Date.now()


    if (now - lastTapTime < 300) {

      if (name === 'Hard Disk (C:)') {
        setTimeout(() => { // set time out for dom to be able to remove and prevent ghost touch
          setCurrentFolder('DiskC')
        }, 100);
        setSelectedFolder({ label: 'Hard Disk (C:)', img: imageMapping(name) })
        setUndo(prev => [...prev, 'DiskC'])
        return;
      }

      if (name === 'Hard Disk (D:)') {
        setTimeout(() => {
          setCurrentFolder('DiskD')
        }, 100);
        setSelectedFolder({ label: 'Hard Disk (D:)', img: imageMapping(name) })
        setUndo(prev => [...prev, 'DiskD'])
        return;
      }

      if (name === 'Project') {
        setTimeout(() => {
          setCurrentFolder('Project')
        }, 100);
        setSelectedFolder({ label: 'Project', img: imageMapping(name) })
        setUndo(prev => [...prev, 'Project'])
        return;
      }

      if (name === 'Picture') {
        setTimeout(() => {
          setCurrentFolder('Picture')
        }, 100);
        setSelectedFolder({ label: 'Picture', img: imageMapping(name) })
        setUndo(prev => [...prev, 'Picture'])
        return;
      }

      if (name === 'Utility') {
        setTimeout(() => {
          setCurrentFolder('Utility')
        }, 100);
        setSelectedFolder({ label: 'Utility', img: imageMapping(name) })
        setUndo(prev => [...prev, 'Utility'])
        return;
      }

      if (type === 'folder') {
        setTimeout(() => {
          setCurrentFolder(name)
        }, 100);
        setSelectedFolder({ label: name, img: imageMapping('Project') })
        setUndo(prev => [...prev, name])
        return;
      }

      handleShowMobile(name)

    }
    setLastTapTime(now)
  }

  const contextValue = {
    forwardTrackIe, setForwardTrackIe,
    backTrackIe, setBackTrackIe,
    deletepermanently,
    currentRightClickFolder, setCurrentRightClickFolder,
    ringMsn, setRingMsn,
    ringMsnOff,
    setRegErrorPopUp, setRegErrorPopUpVal,
    keyRef, setKeyRef,
    UserCreatedFolder, setUserCreatedFolder,
    TaskManagerExpand, setTaskManagerExpand,
    localEffect, setLocalEffect,
    localBg, setLocalBg,
    connectWebSocket,
    websocketConnection,
    chatBotActive, setChatBotActive,
    PatchExpand, setPatchExpand,
    onlineUser,
    UploadExpand, setUploadExpand,
    deleteIcon, setDeleteIcon,
    handleMobileLongPressBin,
    deleteTap,
    refBeingClicked,
    binRestoreArr, setBinRestoreArr,
    rightClickBin, setRightClickBin,
    inFolder, setInFolder,
    handleShowInfolderMobile, handleShowInfolder,
    handleMobileLongPress,
    iconBeingRightClicked, setIconBeingRightClicked,
    rightClickIcon, setRightClickIcon,
    refresh, setRefresh,
    timerRef,
    rightClickDefault, setRightClickDefault,
    rightClickPosition,
    loadedMessages, setLoadedMessages,
    currentPhoto, setCurrentPhoto,
    textError,
    runItemBox, setRunItemBox,
    RunInputVal, setRunInputVal,
    undo, setUndo,
    selectedFolder, setSelectedFolder,
    currentFolder, setCurrentFolder,
    MyComputerExpand, setMyComputerExpand,
    projectStartBar, setProjectStartBar,
    calenderToggle, setCalenderToggle,
    iconContainerSize, iconImgSize, iconTextSize,
    iconScreenSize, setIconScreenSize,
    iconSize, setIconSize,
    notiOn, setNotiOn,
    handleDragStop,
    key, setKey,
    dragging,
    handleOnDrag,
    DesktopRef,
    ProjectFolderRef,
    DiskRef,
    handleDrop,
    dropTargetFolder, setDropTargetFolder,
    startActive, setStartActive,
    time, setTime,
    desktopIcon, setDesktopIcon,
    UserCreatedFolder, setUserCreatedFolder, // Expose UserCreatedFolder and its setter
    tap,
    imageMapping,
    lastTapTime, setLastTapTime,
    handleShow, handleShowMobile,
    StyleHide,
    isTouchDevice,
    ProjectExpand, setProjectExpand,
    handleDoubleClickiframe,
    showClippy, setShowClippy,
    clippyIndex, setClippyIndex,
    randomClippyPopup, setRandomClippyPopup,
    clippyTouched, setClippyTouched,
    RandomTimeoutShowClippy,
    firstTimoutShowclippy,
    SecondRandomTimeoutShowClippy,
    ClearTOdonttouch,
    ObjectState,
    handleSetFocusItemTrue,
    inlineStyleExpand,
    inlineStyle,
    iconFocusIcon,
    deleteTap,
    shutdownWindow, setShutdownWindow,
    MineSweeperExpand, setMineSweeperExpand,
    MSNExpand, setMSNExpand,
    chatData,
    chatValue, setChatValue,
    createChat,
    userNameValue, setUserNameValue,
    endOfMessagesRef,
    clippyUsername,
    ClearTOclippyUsernameFunction,
    login, setLogin,
    openProjectExpand, setOpenProjectExpand,
    projectUrl, setProjectUrl,
    projectname,
    setWindowsShutDownAnimation,
    BgSettingExpand, setBgSettingExpand,
    themeDragBar, setThemeDragBar,
    RunExpand, setRunExpand,
    reMountRun,
    ErrorPopup, setErrorPopup,
    remountRunPosition,
  }


  // show login page
  if (login) {
    if (!login) {
      setLoading(true)
    }
    return (
      <UserContext.Provider value={contextValue}>
        <Login />
      </UserContext.Provider>
    )
  }

  if (windowsShutDownAnimation) {
    return (
      <UserContext.Provider value={contextValue}>
        <WindowsShutdown />
      </UserContext.Provider>
    )
  }

  if (loading && !login) {
    const localThemeBg = localStorage.getItem('theme') || '#098684';

    return (
      <div
        style={{
          width: '100%',
          height: '100svh',
          background: localThemeBg
        }}>
        <img src={loadingSpin} alt="loading"
          style={{
            width: '30px',
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>
    )
  }

  return (
    <>
      <UserContext.Provider value={contextValue}>
        {regErrorPopUp && (
          <ErrorBtn
            themeDragBar={themeDragBar}
            stateVal={regErrorPopUpVal}
            setStateVal={setRegErrorPopUp}
            text={textError}
            runOpenFuction={() => null}
          />
        )}

        {UserCreatedFolder.length > 0 && UserCreatedFolder.map((folder, index) => (
          <EmptyFolder
            key={folder.id}
            state={folder}
            setState={(newState) => {
              setUserCreatedFolder(prev => {
                const updated = prev.map(f =>
                  f.id === folder.id
                    ? { ...f, ...newState }
                    : f
                );
                localStorage.setItem("userFolders", JSON.stringify(updated));
                return updated;
              });
            }}
            folderName={folder.name}
            userCreatedFolderMode={true}
            type='folder'
            refState={UserCreatedFolderRef.current[index]}
          />
        ))}



        <EmptyFolder
          state={PaintExpand}
          setState={setPaintExpand}
          folderName='Paint'
          paintMode={true}
        />

        <EmptyFolder
          state={pictureExpand}
          setState={setPictureExpand}
          refState={PictureRef}
          folderName='Picture'
        />

        <EmptyFolder
          state={BinExpand}
          setState={setBinExpand}
          refState={BinRef}
          folderName='RecycleBin'
        />

        <EmptyFolder
          state={UtilityExpand}
          setState={setUtilityExpand}
          refState={UtilityRef}
          folderName='Utility'
        />

        <EmptyFolder
          state={photoOpenExpand}
          setState={setPhotoOpenExpand}
          folderName='Photo'
          photoMode={true}
        />

        <UploadApp />
        <TaskManager />
        <Patch />
        <RightClickWindows />
        <Notification />
        <Shutdown />
        <MyComputer />
        <ProjectFolder />
        <MineSweeper />
        <MsnFolder />
        <OpenProject />
        <BgSetting />
        <Run />
        <Dragdrop />
        <Footer />
      </UserContext.Provider>
    </>
  )



  function deletepermanently(deleteName) { // delete from desktopIcon

    deleteTap(deleteName)
    const droppedIcon = desktopIcon.find(icon => icon.name === deleteName);

    // Delete from backend if it's a stored file
    if (droppedIcon && droppedIcon.id) {
      apiService.deleteFile(droppedIcon.id).catch(err => console.error("Failed to delete file from backend", err));
    }

    if (droppedIcon) {
      setDesktopIcon(prevIcons => {
        const updatedIcons = prevIcons.filter(icon => icon.name !== droppedIcon.name);
        setKey(prev => prev + 1); // make folder icon by re-mount
        localStorage.setItem('icons', JSON.stringify([...updatedIcons]));
        return [...updatedIcons];
      });
    }
    setDeleteIcon(prev => prev + 1) // important link to useEffect
    setBinRestoreArr(prev => {
      const newBinArr = prev.filter(icon => icon.name !== deleteName);
      localStorage.setItem('restoreArray', JSON.stringify(newBinArr)); // Update localStorage
      return newBinArr;
    });
    const findUserCreatedFolder = UserCreatedFolder.find(
      icon => icon.name === deleteName
    );

    if (findUserCreatedFolder) {
      // Call backend to delete folder recursively
      apiService.deleteFolder(deleteName).catch(err => console.error("Failed to delete folder from backend", err));

      const updatedFolders = UserCreatedFolder.filter(
        folder => folder.name !== findUserCreatedFolder.name
      );

      setUserCreatedFolder(updatedFolders);
      localStorage.setItem("userFolders", JSON.stringify(updatedFolders));
    }


    refBeingClicked.current = null;

  }


  function sortDesktopIcons(iconArr) {
    if (!Array.isArray(iconArr)) return [];

    const lesserXItems = [];

    // Sort icons by y value, and then by x value if y values are equal
    const sortedIcons = [...iconArr].sort((a, b) => {
      if (a.y === b.y) {
        // Compare x values to determine sort order
        if (a.x > b.x) {
          // Push the item with the greater x value to the lesserXItems array
          if (!lesserXItems.includes(a)) {
            lesserXItems.push(a);
          }
        }
      }
      return a.y - b.y; // Sort by y value
    });

    // Remove any items that were pushed to lesserXItems from the sorted array
    const firstArr = sortedIcons.filter(item => !lesserXItems.includes(item));

    return [...firstArr, ...lesserXItems]; // Append lesserXItems at the end
  }



  function handleDragStop(data, iconName, ref) {
    // Capture the actual viewport position of the dragged icon
    const iconElement = ref; // Get the icon ref using its name

    if (iconElement) {
      const { x, y } = iconElement.getBoundingClientRect();
      setDesktopIcon(prevIcons => {
        // Create updatedIcons based on the previous state
        const updatedIcons = prevIcons.map(icon =>
          icon.name === iconName
            ? { ...icon, x: x, y: y }
            : icon
        );

        const sorted = sortDesktopIcons(updatedIcons)
        localStorage.setItem('icons', JSON.stringify(sorted));
        return updatedIcons; // Return the updated state
      });
    }
  }



  function handleDrop(e, name, target, oldFolderID) {
    setDragging(false)
    e.preventDefault();
    e.stopPropagation();

    if (!target || name === target) return; // Exit if folder is empty or same as the icon

    const droppedIcon = desktopIcon.find(icon => icon.name === name);



    if (droppedIcon.folderId === target) {
      setKey(prev => prev + 1)

      return; // make sure its not in the same folder
    }


    // Persist move to backend if it's a stored file
    if (droppedIcon.id) {
      apiService.updateFile(droppedIcon.id, target).catch(err => console.error("Failed to move file on backend", err));
    }

    if (target === 'RecycleBin') {
      setBinRestoreArr(prevArr => {
        const updatedArr = [
          ...prevArr,
          {
            name: name,
            OldFolder: oldFolderID
          }
        ];
        localStorage.setItem('restoreArray', JSON.stringify(updatedArr));
        return updatedArr;
      });
    } else {
      setBinRestoreArr(prev => {
        const updatedArr = prev.filter(item => item.name !== name);
        localStorage.setItem('restoreArray', JSON.stringify(updatedArr));
        return updatedArr;
      });
    }


    if (droppedIcon) {
      setDesktopIcon(prevIcons => {
        const updatedIcons = prevIcons.filter(icon => icon.name !== droppedIcon.name);
        const newIcon = { ...droppedIcon, folderId: target };
        setDropTargetFolder('')
        setKey(prev => prev + 1) //make folder icon by re-mount
        localStorage.setItem('icons', JSON.stringify([...updatedIcons, newIcon]));
        return [...updatedIcons, newIcon];
      });
    }
  }

  function remountRunPosition() { // make Run go back to the original position by remounting draggable by changing key
    if (!RunExpand.show && !ErrorPopup) {
      setReMountRun(prev => prev + 1)
    }
  }




  function ringMsnOff() {
    setRingMsn(true)
    setTimeout(() => {
      setRingMsn(false)
    }, 2000);
  }

  /* -------------------------------------------------------------------------- */
  /*                                 WEBSOCKET                                  */
  /* -------------------------------------------------------------------------- */



  // create chat via WebSocket
  async function createChat() {
    if (!chatValue.trim()) return;

    const newMessage = {
      type: 'message',
      user: userNameValue || 'Anonymous',
      text: chatValue
    };

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(newMessage));
      setChatValue('');
      // No need to manually update chatData or getChat(), 
      // the server will broadcast the message back to us.
    } else {
      console.error('WebSocket not connected');
    }
  }




  function ObjectState() {
    return [

      { name: 'Project', setter: setProjectExpand, usestate: ProjectExpand, color: 'rgba(211, 117, 0, 0.85)', size: 'small' },
      { name: 'Picture', setter: setPictureExpand, usestate: pictureExpand, color: 'rgba(85, 50, 148, 0.85)', size: 'large' },
      { name: 'IE', setter: setOpenProjectExpand, usestate: openProjectExpand, color: 'rgba(0, 159, 186, 0.85)', size: 'small' },
      { name: 'MineSweeper', setter: setMineSweeperExpand, usestate: MineSweeperExpand, color: 'rgba(187, 51, 48, 0.85)', size: 'small' },
      { name: 'MSN', setter: setMSNExpand, usestate: MSNExpand, color: 'rgba(52, 70, 143, 0.85)', size: 'small' },
      { name: 'Internet', setter: setOpenProjectExpand, usestate: openProjectExpand, color: 'rgba(0, 159, 186, 0.85)', size: 'small' },
      { name: 'Settings', setter: setBgSettingExpand, usestate: BgSettingExpand, color: 'rgba(140, 140, 140, 0.85)', size: 'small' },
      { name: 'Run', setter: setRunExpand, usestate: RunExpand, color: 'rgba(86, 114, 122, 0.85)', size: 'small' },
      { name: 'MyComputer', setter: setMyComputerExpand, usestate: MyComputerExpand, color: 'rgba(31, 122, 206, 0.85)', size: 'small' },
      { name: 'Patch', setter: setPatchExpand, usestate: PatchExpand, color: 'rgba(86, 114, 122, 0.85)', size: 'small' },
      { name: 'Photo', setter: setPhotoOpenExpand, usestate: photoOpenExpand, color: 'rgba(0, 120, 93, 0.85)', size: 'small' },
      { name: 'RecycleBin', setter: setBinExpand, usestate: BinExpand, color: 'rgba(64, 135, 66, 0.85)', size: 'small' },
      { name: 'Paint', setter: setPaintExpand, usestate: PaintExpand, color: 'rgba(193, 178, 46, 0.85)', size: 'small' },
      { name: 'Utility', setter: setUtilityExpand, usestate: UtilityExpand, color: 'rgba(116, 85, 54, 0.85)', size: 'small' },
      { name: 'TaskManager', setter: setTaskManagerExpand, usestate: TaskManagerExpand, color: 'rgba(218, 160, 109, 0.85)', size: 'small' },
      { name: 'Upload', setter: setUploadExpand, usestate: UploadExpand, color: 'rgba(31, 122, 206, 0.85)', size: 'small' },

      // Add user folders dynamically with individual state management
      ...UserCreatedFolder.map(folder => ({
        name: folder.name,
        setter: (newState) => {
          setUserCreatedFolder(prev => {
            const updated = prev.map(f =>
              f.id === folder.id
                ? { ...f, ...newState }
                : f
            );
            localStorage.setItem("userFolders", JSON.stringify(updated));
            return updated;
          });
        },
        usestate: folder, // Pass the individual folder object
        color: folder.color || 'rgba(255, 206, 84, 0.85)',
        size: 'small',
        type: 'userCreatedFolder' // Add type identifier
      }))
    ];
  }




  function iconFocusIcon(name) { // if focus on one, the rest goes unfocus

    const allSetItems = ObjectState();

    const passedName = name.toLowerCase().split(' ').join('');

    const updateddesktopIcon = desktopIcon.map(icon => {
      const iconName = icon.name.toLowerCase().split(' ').join('');
      if ('focus' in icon) { // check if focus is in the object
        return { ...icon, focus: iconName === passedName }; // return new focus if matched
      }
      return { ...icon, focus: false }; // return all false if no found
    });
    setDesktopIcon(updateddesktopIcon);

    ///need to be fixed, this logic
    allSetItems.forEach(item => { // set same to folder to distinct from iconName
      const itemName = item.name.toLowerCase().split(' ').join('') + 'folder'
      item.setter(prev => ({ ...prev, focus: passedName === itemName }));
    });
  }

  function handleShow(name) {
    setRightClickDefault(false);

    if (name === '' || !name) return;

    // Check if it's a backend file with a path
    const backendFile = desktopIcon.find(icon => icon.name === name && icon.path);
    if (backendFile) {
      const ext = backendFile.name.split('.').pop().toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        setCurrentPhoto({ name: backendFile.name, pic: backendFile.path });
        handleShow('Photo');
        return;
      } else {
        // Open other files in "Internet" (OpenProject) iframe
        setProjectUrl(backendFile.path);
        handleShow('Internet');
        return;
      }
    }

    const lowerCaseName = name.toLowerCase().split(' ').join('');
    const allSetItems = ObjectState();

    const itemExists = allSetItems.some(item => item.name.toLowerCase().split(' ').join('') === lowerCaseName);

    const pictureMatch = allPicture.find(picture => name.includes(picture.name));

    if (pictureMatch) {
      handleDoubleClickPhotoOpen(name, setCurrentPhoto);
      handleShow('Photo');
      return;
    }

    if (!itemExists) {
      setRegErrorPopUp(true);
      setRegErrorPopUpVal(name);
      return;
    }

    allSetItems.forEach((item) => {
      const itemName = item.name.toLowerCase().trim();

      if (itemName === lowerCaseName) {
        setTimeout(() => {
          if (item.type === 'userCreatedFolder') {
            // Handle user-created folders
            item.setter({
              show: true,
              focusItem: true,
              hide: false,
              zIndex: maxZindexRef.current + 1
            });
          } else {
            // Handle static folders
            item.setter(prev => ({
              ...prev,
              show: true,
              focusItem: true,
              hide: false,
              zIndex: maxZindexRef.current + 1
            }));
          }
          maxZindexRef.current += 1;
        }, 100);

        // Your existing special cases...
        if (lowerCaseName === 'msn') clippyUsernameFunction();
        if (lowerCaseName === 'ie') {
          handleDoubleClickiframe('IE', setOpenProjectExpand, setProjectUrl, setBackTrackIe, setForwardTrackIe)
          handleShow('Internet');
        }
      } else {
        // Set other items to not focused
        if (item.type === 'userCreatedFolder') {
          item.setter({ focusItem: false });
        } else {
          item.setter(prev => ({ ...prev, focusItem: false }));
        }
      }
    });


    if (tap.includes(name)) return;
    setStartActive(false);

    const notToOpenList = ['Run', 'IE'];
    if (notToOpenList.includes(name)) return;

    setTap(prevTap => [...prevTap, name]);
    setDesktopIcon(prevIcons => prevIcons.map(icon => ({ ...icon, focus: false })));
  }

  function handleShowMobile(name) {

    setRightClickDefault(false);

    const now = Date.now()

    if (now - lastTapTime < 300) {

      if (name === '' || !name) return;

      // Check if it's a backend file with a path (uploaded files)
      const backendFile = desktopIcon.find(icon => icon.name === name && icon.path);
      if (backendFile) {
        const ext = backendFile.name.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
          setCurrentPhoto({ name: backendFile.name, pic: backendFile.path });
          handleShow('Photo');
          return;
        } else {
          setProjectUrl(backendFile.path);
          handleShow('Internet');
          return;
        }
      }

      const lowerCaseName = name.toLowerCase().split(' ').join('');

      const allSetItems = ObjectState() // call all usestate object

      const itemExists = allSetItems.some(item => item.name.toLowerCase().split(' ').join('') === lowerCaseName);

      const pictureMatch = allPicture.find(picture => name.includes(picture.name));

      if (pictureMatch) {
        handleDoubleClickPhotoOpen(name, setCurrentPhoto);
        handleShow('Photo');
        return;
      }

      if (!itemExists) {
        setRegErrorPopUp(true);
        setRegErrorPopUpVal(name);
        return;
      }

      allSetItems.forEach((item) => {

        const itemName = item.name.toLowerCase().trim();

        if (itemName === lowerCaseName) {
          setTimeout(() => {
            if (item.type === 'userCreatedFolder') {
              // Handle user-created folders
              item.setter({
                show: true,
                focusItem: true,
                hide: false,
                zIndex: maxZindexRef.current + 1
              });
            } else {
              // Handle static folders
              item.setter(prev => ({
                ...prev,
                show: true,
                focusItem: true,
                hide: false,
                zIndex: maxZindexRef.current + 1
              }));
            }
            maxZindexRef.current += 1;
          }, 100);
          if (lowerCaseName === 'upload') {
            // Upload specific logic if any, currently handled by generic setter
          }
          if (lowerCaseName === 'msn') clippyUsernameFunction();
          if (lowerCaseName === 'ie') {
            handleDoubleClickiframe('IE', setOpenProjectExpand, setProjectUrl, setBackTrackIe, setForwardTrackIe)
            handleShow('Internet');
          }
        }
        if (item.type === 'userCreatedFolder') {
          item.setter({ focusItem: false });
        } else {
          item.setter(prev => ({ ...prev, focusItem: false }));
        }
      });

      if (tap.includes(name)) return;
      setStartActive(false)

      const notToOpenList = ['Run', 'IE'];
      if (notToOpenList.includes(name)) return;

      setTap(prevTap => [...prevTap, name]);
      setDesktopIcon(prevIcons => prevIcons.map(icon => ({ ...icon, focus: false })));

    }
    setLastTapTime(now)
  }


  function handleClippyFunction(setterFunction, clearFunction, allSetters) {
    // Clear all existing timeouts
    allSetters.forEach((setter, index) => {
      if (setter !== setterFunction) {
        setter(false);
        clearTimeout(allClears[index].current);
      }
    });
    setterFunction(true);
    setShowClippy(true);

    clearTimeout(clearFunction.current);
    if (RandomTimeoutShowClippy.current) clearTimeout(RandomTimeoutShowClippy.current);
    if (firstTimoutShowclippy.current) clearTimeout(firstTimoutShowclippy.current);
    if (SecondRandomTimeoutShowClippy.current) clearTimeout(SecondRandomTimeoutShowClippy.current);

    clearFunction.current = setTimeout(() => {
      setterFunction(false);
      setShowClippy(false);
      setRandomClippyPopup(prev => !prev);
    }, 8000);
  }


  function clippyUsernameFunction() {
    handleClippyFunction(setClippyUsername, ClearTOclippyUsernameFunction, allSetters);
  }

  function handleSetFocusItemTrue(name) {
    const LowerCaseName = name.toLowerCase().split(' ').join('');
    const setState = ObjectState();

    const newZIndex = (maxZindexRef.current || 0) + 1;

    setState.forEach((item) => {
      const itemName = item.name.toLowerCase();

      if (itemName === LowerCaseName) {
        if (item.type === 'userCreatedFolder') {
          // mutate directly
          item.setter({
            ...item, // keep existing props
            focusItem: true,
            zIndex: newZIndex,
          });
        } else {
          // safe spread for normal items
          item.setter(prev => ({
            ...prev,
            focusItem: true,
            zIndex: newZIndex,
          }));
        }
        maxZindexRef.current = newZIndex;
      } else {
        if (item.type === 'userCreatedFolder') {
          // direct mutation
          item.setter({
            ...item,
            focusItem: false,
          });
        } else {
          item.setter(prev => ({ ...prev, focusItem: false }));
        }
      }
    });

    // reset desktop icons focus
    setDesktopIcon(prevIcons =>
      prevIcons.map(icon => ({ ...icon, focus: false }))
    );
  }




  function inlineStyleExpand(name) {
    const passedName = name.split(' ').join('').toLowerCase();
    const setState = ObjectState();

    const item = setState.find(item => {
      const itemName = item.name.split(' ').join('').toLowerCase();
      return itemName === passedName;
    });

    if (item) {
      return {
        display: item.usestate.show ? 'block' : 'none',
        maxWidth: 'none',
        width: '100%',
        height: 'calc(100% - 37px)',
        left: `${item.usestate.x <= 0 ? Math.abs(item.usestate.x) * 2 + item.usestate.x : -item.usestate.x}px`,
        top: `${item.usestate.y <= 0 ? Math.abs(item.usestate.y) * 2 + item.usestate.y : -item.usestate.y}px`,
        opacity: item.usestate.hide ? '0' : '1',
        zIndex: item.usestate.hide ? '-1' : (item.usestate.focusItem ? '999' : item.usestate.zIndex),
        pointerEvents: item.usestate.hide ? 'none' : 'auto',
        resize: item.usestate.expand ? 'none' : ''
      };
    }
    return {};
  }

  function inlineStyle(name) {
    const setState = ObjectState();
    const passedName = name.split(' ').join('').toLowerCase();

    const item = setState.find(item => {
      const itemName = item.name.split(' ').join('').toLowerCase();
      return itemName === passedName;
    });

    if (item) {
      return {
        display: item.usestate.show ? 'block' : 'none',
        opacity: item.usestate.hide ? '0' : '1',
        zIndex: item.usestate.hide ? '-1' : (item.usestate.focusItem ? '999' : item.usestate.zIndex),
        pointerEvents: item.usestate.hide ? 'none' : 'auto',
      };
    }

    return {};
  }

  function deleteTap(name) {

    const setState = ObjectState();
    const passedName = name.toLowerCase().split(' ').join('');

    setState.forEach(item => {
      const itemName = item.name.toLowerCase().split(' ').join('');

      if (itemName === passedName) {
        item.setter(prev => ({
          ...prev,
          show: false,
          expand: false,
          hide: false
        }));

        if (item.type === 'userCreatedFolder') { // delete from user created folder folders
          item.setter({
            show: false,
            focusItem: false,
            hide: true,
            zIndex: maxZindexRef.current + 1
          });
        }
        setTap(prevTap => prevTap.filter(tapItem => { // get prevTap to prevent error
          const tapItemName = tapItem.toLowerCase().split(' ').join('');
          return tapItemName !== passedName;
        }));
      }
    });

  }
}

export default App
