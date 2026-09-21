import React, { useContext, useState, useRef } from 'react';
import Draggable from 'react-draggable';
import UseContext from '../Context';
import '../css/MyComputer.css'; // Import MyComputer styles for consistency
import { apiService } from '../services/apiService';
import fileIcon from '../assets/file4download.png';
import { imageMapping } from './function/AppFunctions';

function UploadApp() {
    const {
        UploadExpand, setUploadExpand,
        themeDragBar,
        handleSetFocusItemTrue,
        maxZindexRef,
        setDesktopIcon,
        deleteTap,
        UserCreatedFolder // Import UserCreatedFolder
    } = useContext(UseContext);

    const [selectedFile, setSelectedFile] = useState(null);
    const [destination, setDestination] = useState('Desktop');
    const [uploading, setUploading] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false); // State for custom dropdown

    const fileInputRef = useRef(null);

    // Dynamic Folder List: System Folders + User Created Folders
    // Removed 'My Documents' to prevent ghost folder issue if it doesn't exist visually
    const systemFolders = ['Desktop', 'Project', 'Picture', 'Utility'];
    const userFolders = UserCreatedFolder.map(folder => folder.name);
    const folders = [...systemFolders, ...userFolders];

    const handleClose = (e) => {
        if (e) e.stopPropagation();
        setUploadExpand(prev => ({ ...prev, show: false, hide: true, focusItem: false }));
        deleteTap('Upload');
    };

    const handleMinimize = (e) => {
        if (e) e.stopPropagation();
        setUploadExpand(prev => ({ ...prev, hide: true, focusItem: false }));
    };

    const handleMaximize = (e) => {
        if (e) e.stopPropagation();
        // Placeholder
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
            setStatusMsg('');
        }
    };

    const handleTriggerFileSelect = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!selectedFile) {
            setStatusMsg('Please select a file.');
            return;
        }

        setUploading(true);
        setStatusMsg('Uploading...');

        try {
            const response = await apiService.uploadFile(selectedFile, destination);

            if (response && response.file) {
                setStatusMsg('Upload successful!');
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';

                // Refresh desktop icons logic...
                const newFile = response.file;
                setDesktopIcon(prev => {
                    if (prev.find(icon => icon.id === newFile.id)) return prev;

                    let pic = 'NotePad';
                    let type = 'file';
                    const ext = newFile.name.split('.').pop().toLowerCase();
                    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) { pic = 'Jpeg'; type = '.jpeg'; }
                    else if (['mp3', 'wav'].includes(ext)) { pic = 'Winamp'; type = 'mp3'; }
                    else if (['exe'].includes(ext)) { pic = 'Project'; type = '.exe'; }

                    if (newFile.type === 'folder') { pic = 'Project'; type = 'folder'; }

                    const newIcon = {
                        ...newFile,
                        pic,
                        type: type || '.txt',
                        folderId: destination,
                        x: 0,
                        y: 0,
                        focus: false,
                        size: Math.round(newFile.size / 1024)
                    };
                    return [...prev, newIcon];
                });

            } else {
                setStatusMsg('Upload failed.');
            }
        } catch (error) {
            console.error(error);
            setStatusMsg('Error uploading file.');
        } finally {
            setUploading(false);
        }
    };

    if (!UploadExpand.show) return null;

    const windowStyle = {
        position: 'fixed',
        zIndex: UploadExpand.zIndex,
        display: UploadExpand.hide ? 'none' : 'flex',
        width: '350px',
        flexDirection: 'column',
        // Styles handled by folder_folder class mostly, but positioning needs inline override or context
        // Actually MyComputer uses inline styles for positioning too.
        // We'll keep basic positioning here.
    };

    const sunkenStyle = {
        borderTop: '2px solid #808080',
        borderLeft: '2px solid #808080',
        borderBottom: '2px solid #fff',
        borderRight: '2px solid #fff',
        background: '#fff',
        padding: '2px 4px',
        fontFamily: '"MS Sans Serif", Arial, sans-serif',
        fontSize: '13px'
    };

    const btnStyle = {
        background: '#c0c0c0',
        borderTop: '2px solid #fff',
        borderLeft: '2px solid #fff',
        borderBottom: '2px solid #000',
        borderRight: '2px solid #000',
        fontFamily: '"MS Sans Serif", Arial, sans-serif',
        fontSize: '13px',
        padding: '2px 6px',
        cursor: 'pointer',
        boxShadow: '1px 1px 0px 0px #000'
    };


    return (
        <Draggable
            handle=".folder_dragbar"
            defaultPosition={{ x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 - 150 }}
            position={null}
            scale={1}
            onStart={() => handleSetFocusItemTrue('Upload')}
            onMouseDown={() => handleSetFocusItemTrue('Upload')}
        >
            <div
                className="window folder_folder"
                style={windowStyle}
                onClick={() => {
                    handleSetFocusItemTrue('Upload');
                    setIsDropdownOpen(false);
                }}
            >
                {/* Header - Matching MyComputer structure */}
                <div className="folder_dragbar"
                    style={{ background: UploadExpand.focusItem ? themeDragBar : '#757579' }}
                    onDoubleClick={handleMaximize}
                >
                    <div className="folder_barname">
                        <img src={fileIcon} alt="icon" style={{ width: '16px', height: '16px' }} />
                        <span>File Upload</span>
                    </div>
                    <div className="folder_barbtn">
                        <div onClick={handleMinimize}>
                            <p className='dash'></p>
                        </div>
                        <div onClick={handleMaximize}>
                            <div className="expand"></div>
                        </div>
                        <div>
                            <p className='x' onClick={handleClose}>×</p>
                        </div>
                    </div>
                </div>

                <div className="window-body" style={{ padding: '10px', flex: 1 }}>
                    <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>

                        {/* File Selection */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <label style={{ fontSize: '13px' }}>File to upload:</label>
                            <div style={{ display: 'flex', gap: '5px' }}>
                                <input
                                    type="text"
                                    readOnly
                                    value={selectedFile ? selectedFile.name : ''}
                                    style={{ ...sunkenStyle, flex: 1 }}
                                    placeholder="No file selected"
                                />
                                <button type="button" onClick={handleTriggerFileSelect} style={btnStyle}>
                                    Browse...
                                </button>
                                <input
                                    type="file"
                                    id="file-upload"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    style={{ display: 'none' }}
                                />
                            </div>
                        </div>

                        {/* Destination - Custom Dropdown matching MyComputer */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', position: 'relative' }}>
                            <label style={{ fontSize: '13px' }}>Destination folder:</label>

                            <div className="drive_control" style={{ padding: 0, height: 'auto', border: 'none' }}>
                                <div className="drive_link" style={{ margin: 0, height: '26px' }}>

                                    {isDropdownOpen && (
                                        <div className="popup_select_folder" style={{ marginTop: '26px', width: '100%' }}>
                                            <div className="selected_icon">
                                                <ul>
                                                    {folders.map(folder => (
                                                        <li key={folder} onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDestination(folder);
                                                            setIsDropdownOpen(false);
                                                        }}>
                                                            <img
                                                                // Pass 'folder' type for correct fallback
                                                                src={imageMapping(folder === 'Desktop' ? 'MyComputer' : folder, 'folder')}
                                                                alt=""
                                                            />
                                                            <span>{folder}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    )}

                                    <div className='folder_select_left_container' onClick={(e) => {
                                        e.stopPropagation();
                                        setIsDropdownOpen(!isDropdownOpen);
                                    }} style={{ flex: 1, justifyContent: 'flex-start', cursor: 'pointer' }}>
                                        <img
                                            src={imageMapping(destination === 'Desktop' ? 'MyComputer' : destination, 'folder')}
                                            alt=""
                                            style={{ marginLeft: '5px' }}
                                        />
                                        <p style={{ marginLeft: '10px', top: 0 }}>{destination}</p>
                                    </div>

                                    <div className="folder_select_btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsDropdownOpen(!isDropdownOpen);
                                        }}
                                    >
                                        <span style={{ fontSize: '10px', top: '-2px' }}>▼</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '5px', gap: '5px' }}>
                            <button
                                type="submit"
                                disabled={uploading}
                                style={{
                                    ...btnStyle,
                                    padding: '4px 12px',
                                    fontWeight: 'bold',
                                    cursor: uploading ? 'wait' : 'pointer'
                                }}
                            >
                                {uploading ? 'Uploading...' : 'Upload'}
                            </button>
                            <button
                                type="button"
                                onClick={handleClose}
                                style={{
                                    ...btnStyle,
                                    padding: '4px 12px'
                                }}
                            >
                                Cancel
                            </button>
                        </div>

                        {statusMsg && (
                            <div style={{ marginTop: '5px', fontSize: '12px', color: statusMsg.includes('success') ? 'green' : 'red' }}>
                                {statusMsg}
                            </div>
                        )}
                    </form>
                </div>
            </div>
        </Draggable>
    );
}

export default UploadApp;
