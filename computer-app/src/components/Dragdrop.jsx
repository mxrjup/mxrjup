import { useEffect, useContext, useRef, useState } from 'react';
import UseContext from '../Context';
import Draggable from 'react-draggable';
import binEmp from '../assets/bin2.png'
import bin from '../assets/bin.png'
import { IoIosSearch } from "react-icons/io";
import { motion, AnimatePresence } from 'framer-motion';


import { apiService } from '../services/apiService';

function Dragdrop() {
  const [searchPopup, setSearchPopup] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const {
    setCurrentRightClickFolder,
    refBeingClicked,
    handleMobileLongPress,
    timerRef, setIconBeingRightClicked, setRightClickIcon,
    refresh,
    setCalenderToggle,
    iconContainerSize, iconImgSize, iconTextSize,
    iconScreenSize,
    setIconSize,
    key,
    handleDragStop,
    DesktopRef,
    handleOnDrag,
    isDragging,
    dropTargetFolder, setDropTargetFolder,
    handleDrop,
    desktopIcon, setDesktopIcon,
    imageMapping,
    handleShow, handleShowMobile,
    isTouchDevice,
    iconFocusIcon,
    setStartActive
  } = useContext(UseContext);

  // Create an array of refs for each icon
  const iconRefs = useRef([]);

  function captureIconPositions() {
    const positions = desktopIcon.reduce((acc, icon) => {
      const iconElement = iconRefs.current[icon.name]; // Get the icon ref using its name

      if (iconElement) {
        const { x, y } = iconElement.getBoundingClientRect(); // Get the current position
        acc[icon.name] = { x: x, y: y };
      }
      return acc;
    }, {});

    setDesktopIcon((prevIcons) => {
      return prevIcons.map(icon => {
        if (positions[icon.name]) {
          return { ...icon, x: positions[icon.name].x, y: positions[icon.name].y }; // Update position
        }
        return icon;
      });
    });
  }


  useEffect(() => {
    // Capture positions initially
    captureIconPositions();

    const handleResize = () => {
      captureIconPositions();

    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [key]);

  const recycleBin = desktopIcon.filter(icon => icon.folderId === 'RecycleBin');
  const recycleBinLength = recycleBin.length;


  function googleSearch() {
    setTimeout(() => {
      setSearchPopup(false);
    }, 100);
    if (searchValue.trim() !== '') {
      const query = encodeURIComponent(searchValue);
      const url = `https://www.google.com/search?q=${query}`;
      window.open(url, '_blank');
      setSearchValue('');
    }
  }

  const handleFileDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      let dropX = e.clientX;
      let dropY = e.clientY;

      for (const file of files) {
        try {
          // Upload to Desktop folder
          const response = await apiService.uploadFile(file, 'Desktop');

          if (response && response.file) {
            // Helper for Icon Mapping (matched to App.jsx logic)
            const getIconType = (filename) => {
              if (!filename) return { pic: 'NotePad', type: 'file' };
              const ext = filename.split('.').pop().toLowerCase();
              if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return { pic: 'Jpeg', type: '.jpeg' };
              if (['txt', 'md', 'json', 'js', 'css'].includes(ext)) return { pic: 'NotePad', type: 'notepad' };
              if (['mp3', 'wav'].includes(ext)) return { pic: 'Winamp', type: 'mp3' };
              if (['exe'].includes(ext)) return { pic: 'Project', type: '.exe' };
              return { pic: 'NotePad', type: 'file' };
            };

            const { pic, type } = getIconType(response.file.name);

            setDesktopIcon(prev => {
              // Check if file already exists in state
              if (prev.find(icon => icon.id === response.file.id)) return prev;

              return [...prev, {
                ...response.file,
                // Ensure properties match desktop icon structure
                id: response.file.id,
                name: response.file.name,
                type: type,
                pic: pic,
                folderId: 'Desktop',
                focus: false,
                size: Math.round(response.file.size / 1024),
                x: dropX,
                y: dropY,
              }];
            });
            // Offset next file slightly
            dropX += 20;
            dropY += 20;
          }
        } catch (error) {
          console.error("Upload failed for file:", file.name, error);
          alert(`Failed to upload ${file.name}`);
        }
      }
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <section className='bound'
      onContextMenu={() => setCurrentRightClickFolder('Desktop')}
      onTouchStart={() => setCurrentRightClickFolder('Desktop')}
      ref={DesktopRef}
      onDrop={handleFileDrop}
      onDragOver={onDragOver}
      onClick={(e) => {
        if (!isDragging) {
          iconFocusIcon('');
          setStartActive(false)
          setIconSize(false)
          setCalenderToggle(false)
        }
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* <div className="search_icon"
        style={{
          display: searchPopup ? 'none' : '',
          touchAction: searchPopup ? 'auto' : 'none',
          pointerEvents: searchPopup ? 'auto' : 'none',
        }}
      >
        <span><IoIosSearch /></span>
      </div>
      <AnimatePresence>
        <motion.div className="search_bar"
          onClick={() => setSearchPopup(true)}
          style={{
            width: searchPopup ? '' : '22px',
            opacity: searchPopup ? '1' : '0',
          }}
          initial={{ width: '22px', opacity: 0 }}
          animate={{ width: searchPopup ? '200px' : '22px', opacity: searchPopup ? 1 : 0 }}
          exit={{ width: '22px', opacity: 0 }}
          transition={{ duration: 0.01, ease: "easeInOut" }}
        > 
          <input type="text" placeholder='Type here to search...'
            value={searchValue} 
            onChange={(e) => setSearchValue(e.target.value)}
            style={{
              touchAction: searchPopup ? 'auto' : 'none',
              pointerEvents: searchPopup ? 'auto' : 'none',
            }}
          />
          <span
            style={{
              touchAction: searchPopup ? 'auto' : 'none',
              pointerEvents: searchPopup ? 'auto' : 'none',
            }}
            onClick={googleSearch}
          
          ><IoIosSearch />
          </span>
        </motion.div>
      </AnimatePresence> */}

      <div className='drag_drop'
        key={refresh}
      >
        {desktopIcon.filter(icon => icon.folderId === 'Desktop').map((icon) => (
          <Draggable
            key={icon.name}
            grid={[10, 10]}
            axis="both"
            handle=".icon"
            scale={1}
            bounds='.bound'
            onStart={() => { setDropTargetFolder('') }}
            onDrag={(e, data) => {
              // Call original handleOnDrag for other potential logic (though we are overriding the main collision logic here)
              handleOnDrag(icon.name, iconRefs.current[icon.name])();

              // Custom collision detection for Desktop Folders
              const iconRect = iconRefs.current[icon.name].getBoundingClientRect();

              // Find other folders on desktop
              const desktopFolders = desktopIcon.filter(i => i.folderId === 'Desktop' && (i.type === 'folder' || i.type === 'ReCycleBin') && i.name !== icon.name);

              let foundCollision = false;
              for (const folder of desktopFolders) {
                const folderRef = iconRefs.current[folder.name];
                if (folderRef) {
                  const folderRect = folderRef.getBoundingClientRect();

                  // Simple AABB collision detection
                  if (
                    iconRect.left < folderRect.right &&
                    iconRect.right > folderRect.left &&
                    iconRect.top < folderRect.bottom &&
                    iconRect.bottom > folderRect.top
                  ) {
                    setDropTargetFolder(folder.name);
                    foundCollision = true;
                    break;
                  }
                }
              }
              // If no desktop folder collision, we rely on App.jsx handleOnDrag for other windows (like RecycleBin, MyComputer) 
              // via the handleOnDrag call above, assuming it sets state. 
              // However, to prevent flickering if App.jsx clears it, we might need coordination.
              // For now, let's assume if we found a desktop folder, we force it.
            }}
            onStop={(e, data) => {
              handleDragStop(data, icon.name, iconRefs.current[icon.name])
              handleDrop(e, icon.name, dropTargetFolder, icon.folderId)
              clearTimeout(timerRef.current)
            }}
          >
            <div
              className='icon'
              style={iconContainerSize(iconScreenSize)}
              ref={(el) => iconRefs.current[icon.name] = el}
              onContextMenu={() => {
                setRightClickIcon(true);
                iconFocusIcon(icon.name);
                setIconBeingRightClicked(icon);
                refBeingClicked.current = iconRefs.current[icon.name]
              }}
              onDoubleClick={() => handleShow(icon.name)}
              onClick={!isTouchDevice ? (e) => {
                iconFocusIcon(icon.name);
                e.stopPropagation();
              } : undefined}
              onTouchStart={(e) => {
                e.stopPropagation();
                handleShowMobile(icon.name);
                iconFocusIcon(icon.name);
                handleMobileLongPress(e, icon);
                refBeingClicked.current = iconRefs.current[icon.name]
              }}
            >
              <img
                src={icon.name === 'RecycleBin' && recycleBinLength === 0 ? binEmp
                  : icon.name === 'RecycleBin' && recycleBinLength > 0 ? bin
                    : imageMapping(icon.pic)} alt={icon.name} className={icon.focus ? 'img_focus' : ''}
                style={iconImgSize(iconScreenSize)}
              />
              <p className={icon.focus ? 'p_focus' : ''}
                style={iconTextSize(iconScreenSize)}
              >
                {icon.name}
              </p>
            </div>
          </Draggable>
        ))}
      </div>
    </section>
  );
}

export default Dragdrop;
