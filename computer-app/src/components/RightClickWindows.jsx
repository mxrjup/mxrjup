import { useEffect, useRef, useContext, useState } from 'react';
import UseContext from '../Context';
import '../css/RightClickWindows.css';
import { BsFillCaretRightFill } from "react-icons/bs";
import { motion } from 'framer-motion';
import { apiService } from '../services/apiService';

function RightClickWindows() {
  const timerRef = useRef(false);
  const [sortExpand, setSortExpand] = useState(false);
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const [restoreIcon, setRestoreIcon] = useState(0)
  const [popUpCreateFolderName, setPopUpCreateFolderName] = useState(false);
  const [newFolderNameVal, setNewFolderNameVal] = useState('');

  const {
    regErrorPopUpVal,
    setRegErrorPopUpVal, setRegErrorPopUp,
    currentRightClickFolder,
    UserCreatedFolder, setUserCreatedFolder,
    ObjectState,
    deleteIcon, setDeleteIcon,
    setKey,
    refBeingClicked,
    binRestoreArr, setBinRestoreArr,
    rightClickBin, setRightClickBin,
    inFolder, setInFolder,
    handleShowInfolder,
    iconBeingRightClicked,
    rightClickIcon, setRightClickIcon,
    setDesktopIcon, desktopIcon,
    iconFocusIcon,
    setRefresh,
    handleShow,
    rightClickDefault, setRightClickDefault,
    rightClickPosition,
  } = useContext(UseContext);


  useEffect(() => {
    setSortExpand(false);
  }, [rightClickDefault]);

  function refreshed() {
    setRightClickDefault(false);
    setRefresh(prev => prev + 1);
    // setSortIconTrigger(prev => prev + 1)
  }


  // useEffect(() =>{
  //   if(sortIconTrigger > 0){
  //     const updatedSortedIcon = sortedIcon.length > 1 ? sortedIcon : desktopIcon
  //     setDesktopIcon(updatedSortedIcon)
  //     setRefresh(prev => prev + 1);
  //   }

  // },[sortIconTrigger])


  function handleSwitchOpenFolder() { // decide which folder function to call

    if (iconBeingRightClicked.name === inFolder) {
      handleShowInfolder(iconBeingRightClicked.name)
      setInFolder('')
      return;
    }
    handleShow(iconBeingRightClicked.name);
  }


  function handleDeleteIcon() {

    const IconCannotBeDeleted = ['MyComputer', 'RecycleBin', "Hard Disk (C:)", "Hard Disk (D:)", "CD-ROM", 'Store']

    if (IconCannotBeDeleted.includes(iconBeingRightClicked.name)) return;
    // Add icon to binRestoreArr
    // Update state and ensure localStorage is updated properly
    setBinRestoreArr(prevArr => {
      const updatedArr = [
        ...prevArr,
        {
          name: iconBeingRightClicked.name,
          OldFolder: iconBeingRightClicked.folderId
        }
      ];
      localStorage.setItem('restoreArray', JSON.stringify(updatedArr));
      return updatedArr;
    });


    const droppedIcon = desktopIcon.find(icon => icon.name === iconBeingRightClicked.name);
    if (droppedIcon) {
      setDesktopIcon(prevIcons => {
        const updatedIcons = prevIcons.filter(icon => icon.name !== droppedIcon.name);
        const newIcon = { ...droppedIcon, folderId: 'RecycleBin' };
        setKey(prev => prev + 1); // make folder icon by re-mount
        localStorage.setItem('icons', JSON.stringify([...updatedIcons, newIcon]));
        return [...updatedIcons, newIcon];
      });
    }
    setDeleteIcon(prev => prev + 1) // important link to useEffect
  }

  useEffect(() => { // the only way to make it works is to mutate state like this for DELETE ICON
    if (deleteIcon > 0) {
      setDesktopIcon(prevIcons => {
        return prevIcons.map(icon =>
          icon.name === iconBeingRightClicked.name
            ? { ...icon, folderId: 'RecycleBin' }  // Mutate the `folderId`
            : icon
        ).slice(); // Creates a new array reference
      });

      setKey(prev => prev + 1); // Force re-render by changing an unrelated state
    }
  }, [deleteIcon]);



  function handleRestore() {

    const droppedIcon = binRestoreArr.find(icon => icon.name === iconBeingRightClicked.name);

    if (!droppedIcon) return; //prevent error if not found

    if (droppedIcon) {
      setDesktopIcon(prevIcons => {
        const findIconToRestore = prevIcons.find(icon => icon.name === droppedIcon.name)
        const updatedIcons = prevIcons.filter(icon => icon.name !== droppedIcon.name);
        const restoredIcon = { ...findIconToRestore, folderId: droppedIcon.OldFolder };
        console.log(restoredIcon)

        setKey(prev => prev + 1); // make folder icon by re-mount

        const newDesktopIcons = [...updatedIcons, restoredIcon];
        localStorage.setItem('icons', JSON.stringify(newDesktopIcons));
        return newDesktopIcons;
      });
      // if(!binRestoreArr) return;
      // setBinRestoreArr(prev => {
      //   const newBinArr = prev.filter(icon => icon.name !== droppedIcon.name);
      //   localStorage.setItem('restoreArray', JSON.stringify(newBinArr)); // Update localStorage
      //   return newBinArr;
      // });
    }
    setRestoreIcon(prev => prev + 1) // important link to useEffect
  }


  useEffect(() => { // the only way to make it works is to mutate state like this for DELETE ICON
    if (restoreIcon > 0) {
      if (!binRestoreArr) return;
      const iconBeingRestored = binRestoreArr.find(icon => icon.name === iconBeingRightClicked.name)
      setBinRestoreArr(prev => {
        const newBinArr = prev.filter(icon => icon.name !== iconBeingRightClicked.name);
        localStorage.setItem('restoreArray', JSON.stringify(newBinArr)); // Update localStorage
        return newBinArr;
      });

      setDesktopIcon(prevIcons => {
        return prevIcons.map(icon =>
          icon.name === iconBeingRightClicked.name
            ? { ...icon, folderId: iconBeingRestored.OldFolder }  // Mutate the `folderId`
            : icon
        ).slice(); // Creates a new array reference
      });

      setKey(prev => prev + 1); // Force re-render by changing an unrelated state
    }
  }, [restoreIcon]);



  async function CreateFolder() {

    if (newFolderNameVal.trim() === '') return;

    const allState = ObjectState();

    const checkIfFolderExist = allState.some(item => item.name === newFolderNameVal.trim());

    if (checkIfFolderExist) return;

    const checkedNameNoSpace = newFolderNameVal.trim().replace(/\s+/g, '');

    const id = `folder-${Date.now()}`;

    // Create folder on backend
    let backendFolder;
    try {
      // Use currentRightClickFolder as the parent (it holds the name/ID of the folder we clicked in)
      const parentId = currentRightClickFolder || 'Desktop';
      const response = await apiService.createFolder(checkedNameNoSpace, parentId);
      if (response && response.folder) {
        backendFolder = response.folder;
      }
    } catch (error) {
      console.error("Failed to create folder on backend", error);
      alert("Failed to create folder: " + (error.response?.data?.error || error.message));
      return;
    }

    // Calculate grid position
    // Default size if not found (based on iconContainerSize default)
    const gridWidth = 75;
    const gridHeight = 75;

    // Simple grid calculation (1-based index)
    // We use Math.max(1, ...) to ensure we don't get 0 or negative
    const gridX = Math.max(1, Math.ceil(rightClickPosition.x / gridWidth));
    const gridY = Math.max(1, Math.ceil(rightClickPosition.y / gridHeight));

    // Use backend response if available, otherwise fallback
    const newFolder = backendFolder ? {
      ...backendFolder,
      folderId: backendFolder.folder, // CRITICAL: Map backend 'folder' to frontend 'folderId'
      // Ensure frontend specific props are set
      focus: false,
      x: gridX,
      y: gridY
    } : {
      id,
      pic: "Project",
      name: checkedNameNoSpace,
      type: "folder",
      folderId: currentRightClickFolder || "Desktop",
      size: "2000",
      x: gridX,
      y: gridY,
    };

    setDesktopIcon(prev => {
      const updatedIcons = [...prev, newFolder];
      localStorage.setItem("icons", JSON.stringify(updatedIcons));
      return updatedIcons;
    });

    const newStateFolder = {
      id: newFolder.id,
      name: checkedNameNoSpace, // This name is used as the 'folderId' for items inside IT
      expand: false,
      show: false,
      hide: false,
      focusItem: false,
      x: 0,
      y: 0,
      zIndex: 1,
    };

    setUserCreatedFolder(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const updatedFolders = [...safePrev, newStateFolder];
      localStorage.setItem("userFolders", JSON.stringify(updatedFolders));
      return updatedFolders;
    });
    setPopUpCreateFolderName(false)
    setNewFolderNameVal('')
  }
  console.log(iconBeingRightClicked.name, regErrorPopUpVal)

  function askBeforeDelete() {
    setRegErrorPopUpVal(iconBeingRightClicked.name)
    setRegErrorPopUp(true)
  }


  function arrangeIcons() {
    if (currentRightClickFolder === 'MyComputer') return;

    const iconsOnFolder = desktopIcon.filter(icon => icon.folderId === currentRightClickFolder);
    const newArrangedIcons = iconsOnFolder.sort((a, b) => a.name.localeCompare(b.name));
    const otherIcons = desktopIcon.filter(icon => icon.folderId !== currentRightClickFolder);
    const updatedIcons = [...newArrangedIcons, ...otherIcons];
    setDesktopIcon(updatedIcons);
    localStorage.setItem('icons', JSON.stringify(updatedIcons));
    setRightClickDefault(false);

    if (currentRightClickFolder === 'Desktop') {
      refreshed()
    }
  }

  function arrangeIconsByType() {
    if (currentRightClickFolder === 'MyComputer') return;

    const iconsOnFolder = desktopIcon.filter(icon => icon.folderId === currentRightClickFolder);
    const newArrangedIcons = [...iconsOnFolder].sort((a, b) => a.type.localeCompare(b.type));
    const otherIcons = desktopIcon.filter(icon => icon.folderId !== currentRightClickFolder);
    const updatedIcons = [...newArrangedIcons, ...otherIcons];
    setDesktopIcon(updatedIcons);
    localStorage.setItem('icons', JSON.stringify(updatedIcons));
    setRightClickDefault(false);

    if (currentRightClickFolder === 'Desktop') {
      refreshed()
    }
  }




  function handleOpenExpandArrageBy() { // delay the expand window
    timerRef.current = true;

    setTimeout(() => {
      if (timerRef.current) {
        setSortExpand(true)
      }
    }, 350);
  }

  return (
    <>
      {popUpCreateFolderName && (
        <div className="pop_up_create">
          <p>Enter folder name: </p>
          <input type="text"
            value={newFolderNameVal}
            onChange={(e) => setNewFolderNameVal(e.target.value)}
            maxLength={10}
            onKeyDown={(e) => e.key === 'Enter' ? CreateFolder() : null}
          />
          <div className="ok_cancel_btn">
            <button
              onClick={CreateFolder}
            >OK</button>
            <button
              onClick={() => {
                setPopUpCreateFolderName(false)
                setNewFolderNameVal('')
              }}
            >Cancel</button>
          </div>
        </div>
      )}
      {(rightClickDefault && !rightClickIcon && !rightClickBin) && (
        <div className='window_rightclick_container'
          style={{
            top: screenHeight - rightClickPosition.y < 217 ? screenHeight - 217 : rightClickPosition.y,
            left: screenWidth - rightClickPosition.x < 138 ? screenWidth - 138 : rightClickPosition.x
          }}
        >
          {sortExpand && (
            <div className="sort_expand"
              style={{
                right: screenWidth - rightClickPosition.x < 280 ? '136px' : '-136px',
              }}
            >
              <p
                onClick={arrangeIcons}
              >Name</p>
              <p
                onClick={arrangeIconsByType}
              >Type</p>
            </div>
          )}
          <motion.p
            onClick={() => setSortExpand(prev => !prev)}
            onHoverStart={() => handleOpenExpandArrageBy()}
            onHoverEnd={() => timerRef.current = false}
          >
            Arrange by
            <span><BsFillCaretRightFill /></span>
          </motion.p>

          <p style={{ paddingLeft: '25px' }}
            onClick={() => {
              handleShow('TaskManager')
              setRightClickDefault(false);
            }}
          >Task Manager</p>
          <h5></h5>
          <p style={{ color: '#8a8989' }}>Paste</p>
          <p style={{ color: '#8a8989' }}>Paste Shortcut</p>
          <p
            onClick={() => {
              refreshed()
              iconFocusIcon('')
            }}
          >
            Refresh
          </p>
          <h5></h5>
          <p
            onClick={() => {
              setPopUpCreateFolderName(true);
              setRightClickDefault(false);
            }}
          >
            New Folder
            {/* <span>
                    <BsFillCaretRightFill/>
                </span> */}
          </p>
          <h5></h5>
          <p
            onClick={() => {
              handleShow('Settings')
              setRightClickDefault(false);
            }}
          >
            Properties
          </p>
        </div>
      )}
      {(rightClickDefault && rightClickIcon && !rightClickBin) && (
        <div className='window_rightclick_container'
          style={{
            top: screenHeight - rightClickPosition.y < 217 ? screenHeight - 217 : rightClickPosition.y,
            left: screenWidth - rightClickPosition.x < 138 ? screenWidth - 138 : rightClickPosition.x,
            height: '212px', width: '128px'
          }}
        >
          <p
            onClick={() => {
              handleSwitchOpenFolder();
              iconFocusIcon('')
              setRightClickIcon(false);
              refBeingClicked.current = null;
            }}
          >
            Open
          </p>
          <p style={{ paddingLeft: '25px' }}>Edit</p>
          <h5></h5>
          <p>
            Send To
            <span>
              <BsFillCaretRightFill />
            </span>
          </p>
          <h5></h5>
          <p style={{ color: '#8a8989' }}>Cut</p>
          <p style={{ color: '#8a8989' }}>Copy</p>
          <h5></h5>
          <p
            onClick={() => {
              handleDeleteIcon();
              iconFocusIcon('')
              setRightClickIcon(false);
              setRightClickDefault(false)
              refBeingClicked.current = null;
            }}
          >
            Delete
          </p>
          <p>Rename</p>
          <h5></h5>
          <p>Properties</p>
        </div>
      )}
      {(rightClickDefault && !rightClickIcon && rightClickBin) && (
        <div className='window_rightclick_container'
          style={{
            top: screenHeight - rightClickPosition.y < 217 ? screenHeight - 217 : rightClickPosition.y,
            left: screenWidth - rightClickPosition.x < 138 ? screenWidth - 138 : rightClickPosition.x,
            height: '120px', width: '120px'
          }}
        >
          <p
            onClick={() => {
              handleRestore();
              iconFocusIcon('')
              setRightClickBin(false);
              setRightClickDefault(false)
              refBeingClicked.current = null;
            }}
          >
            Restore
          </p>
          <h5></h5>
          <p >Cut</p>
          <h5></h5>
          <p
            onClick={() => {
              setRightClickBin(false);
              setRightClickDefault(false)
              iconFocusIcon('')
              askBeforeDelete();
              // deletepermanently()
            }}
          >Delete</p>
          <h5></h5>
          <p>Properties</p>
        </div>
      )}

    </>
  );
}

export default RightClickWindows;
