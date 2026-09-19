import UseContext from '../Context';
import { useContext, useState, useRef, useEffect } from "react";
import Draggable from 'react-draggable';
import { motion } from 'framer-motion';
import msnPic from '../assets/msn.png';
import chat from '../assets/chat.png';
import nudge from '../assets/nudge.png';
import nudgeSound from '../assets/nudgeSound.mp3';
import '../css/MSN.css';

function MsnFolder() {

  const {
    handleShow,
    ringMsnOff,
    ringMsn, setRingMsn,
    connectWebSocket,
    websocketConnection,
    chatBotActive, setChatBotActive,
    onlineUser,
    loadedMessages, setLoadedMessages,
    themeDragBar,
    sendDisable,
    endOfMessagesRef,
    createChat,
    userNameValue, setUserNameValue,
    chatValue, setChatValue,
    chatData,
    MSNExpand, setMSNExpand,
    lastTapTime, setLastTapTime,
    StyleHide,
    isTouchDevice,
    handleSetFocusItemTrue,
    inlineStyleExpand,
    inlineStyle,
    deleteTap,
  } = useContext(UseContext);


  const [userName, setUserName] = useState(false);
  const [tempUserName, setTempUserName] = useState(''); // Local state for input

  // Initialize tempUserName when modal opens
  useEffect(() => {
    if (userName) {
      setTempUserName(userNameValue || '');
    }
  }, [userName, userNameValue]);

  const topOfMessagesRef = useRef(null); // Ref to track the top of the chat container
  const [initialLoading, setInitialLoading] = useState(false)


  const lastMessage = chatData.length > 0
    ? (chatData[chatData.length - 1].timestamp || new Date().toISOString()).split('').slice(0, 10).join('')
    : 'No messages yet';

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [MSNExpand.show])


  useEffect(() => {

    if (ringMsn) {
      handleShow('MSN');
      const audio = new Audio(nudgeSound);
      audio.play().catch((err) => console.error("Audio play failed:", err));

    }
  }, [ringMsn]);


  // Auto-scroll to bottom when the last message changes (new message arrived or initial load)
  useEffect(() => {
    if (loadedMessages.length > 0 && MSNExpand.show) {
      // Only scroll if the last message is new, effectively.
      // Or simply always scroll to bottom if loadedMessages changes at the end?
      // We can check if we are performing a history load by comparing length, but simpler:
      // if last message ID changed, scroll.
      endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [MSNExpand.show, loadedMessages[loadedMessages.length - 1]?.id]);

  useEffect(() => {
    // Only set up observer if we have messages to scroll up to
    if (loadedMessages.length > 0 && chatData.length > loadedMessages.length) {
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          loadMoreMessages();
        }
      }, {
        root: null,
        rootMargin: '10px', // slightly eager
        threshold: 0.1
      });

      if (topOfMessagesRef.current) {
        observer.observe(topOfMessagesRef.current);
      }

      return () => {
        if (topOfMessagesRef.current) {
          observer.unobserve(topOfMessagesRef.current);
        }
      };
    }
  }, [loadedMessages, chatData]); // Re-bind when data changes so we check if we need to load more

  useEffect(() => {
    if (chatData.length === 0) return;

    // Initial load: If strictly empty, load last 50 (max from server) to show full history
    if (loadedMessages.length === 0) {
      setLoadedMessages(chatData.slice(-50));
      return;
    }

    // Sync: Check for new messages at the end
    // We assume chatData only grows at the end.
    // If chatData is longer, we might have new messages.
    // We'll append any message in chatData that isn't in loadedMessages (by ID check).

    const lastLoadedId = loadedMessages[loadedMessages.length - 1]?.id;
    if (!lastLoadedId) return;

    // Find where the last loaded message is in the new chatData
    const indexInNewData = chatData.findIndex(msg => msg.id === lastLoadedId);

    if (indexInNewData !== -1 && indexInNewData < chatData.length - 1) {
      // There are new messages after our last loaded one
      const newMessages = chatData.slice(indexInNewData + 1);
      setLoadedMessages(prev => [...prev, ...newMessages]);
    } else if (indexInNewData === -1) {
      // Fallback: If we can't align (maybe massive update?), just reload last 20
      // Or if chatData completely changed.
      // For robustness, if chatData is significantly different, reset or just append diff.
      // But for this simple app, append newly discovered diffs or reset if messed up.
      // Let's rely on simple length check + ID filter for robustness.
      const newMessages = chatData.filter(m => !loadedMessages.some(lm => lm.id === m.id));
      if (newMessages.length > 0) {
        setLoadedMessages(prev => [...prev, ...newMessages]);
      }
    }

  }, [chatData]); // Check sync whenever chatData updates

  // Infinite scroll load more (older messages)
  function loadMoreMessages() {
    if (loadedMessages.length >= chatData.length) return; // All loaded

    const currentLength = loadedMessages.length;
    // Calculate how many more we can load from the top
    // We want to slice from the "unloaded" portion at the beginning of chatData.
    // Index of the first loaded message in chatData?
    const firstLoadedId = loadedMessages[0]?.id;
    const indexInChatData = chatData.findIndex(msg => msg.id === firstLoadedId);

    if (indexInChatData > 0) {
      // We have 'indexInChatData' messages before the current view.
      // Load up to 20 of them.
      const start = Math.max(0, indexInChatData - 20);
      const moreMessages = chatData.slice(start, indexInChatData);

      setTimeout(() => {
        setLoadedMessages(prev => [...moreMessages, ...prev]);
      }, 500); // reduced delay for snappier feel
    }
  }


  function handleDragStop(event, data) {
    const positionX = data.x;
    const positionY = data.y;
    setMSNExpand(prev => ({
      ...prev,
      x: positionX,
      y: positionY
    }));
  }

  function handleExpandStateToggle() {
    setMSNExpand(prevState => ({
      ...prevState,
      expand: !prevState.expand
    }));
  }

  function handleExpandStateToggleMobile() {
    const now = Date.now();
    if (now - lastTapTime < 300) {
      setMSNExpand(prevState => ({
        ...prevState,
        expand: !prevState.expand
      }));
    }
    setLastTapTime(now);
  }

  const handleSend = (e) => {
    e && e.preventDefault();
    if (typeof createChat === 'function') {
      createChat();
    } else {
      console.error("createChat is not a function:", createChat);
    }
  };

  return (
    <>
      <Draggable
        axis="both"
        handle={'.folder_dragbar-MSN'}
        grid={[1, 1]}
        scale={1}
        disabled={MSNExpand.expand}
        bounds={{ top: 0 }}
        defaultPosition={{
          x: window.innerWidth <= 500 ? 20 : 50,
          y: window.innerWidth <= 500 ? 40 : 120,
        }}
        onStop={(event, data) => handleDragStop(event, data)}
        onStart={() => handleSetFocusItemTrue('MSN')}
      >
        <div className={`folder_folder-MSN ${ringMsn ? 'shake' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            handleSetFocusItemTrue('MSN');
          }}
          onAnimationEndCapture={() => {
            setRingMsn(false)
          }}
          style={
            MSNExpand.expand ? inlineStyleExpand('MSN') : inlineStyle('MSN')
          }
        >

          {/* -------------------------- Add username --------------------------------- */}
          <div className={userName ? 'Username_input_div_active' : 'Username_input_div_disabled'}>
            <div className="container_username">
              <div className="form_banner"
                style={{ background: MSNExpand.focusItem ? themeDragBar : '#757579' }}
              >
                <img src={chat} alt="chat" />
                <p className='username_text_banner'>
                  Username
                </p>
                <div className="close_form_banner"
                  onClick={() => setUserName(false)}
                >
                  <p>×</p>
                </div>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); }}>
                <p>
                  Username:
                </p>
                <input type="text" maxLength={20} placeholder='Enter your username here...'
                  value={tempUserName}
                  onChange={(e) => setTempUserName(e.target.value)}
                  autoFocus={userName}
                />
                <div className="ok_cancel_username">
                  <button
                    onClick={() => {
                      setUserName(false)
                      setUserNameValue(tempUserName)
                      localStorage.setItem('username', tempUserName)
                    }}
                  >
                    Ok
                  </button>
                  <button
                    onClick={() => {
                      setUserName(false);
                      // No need to reset userNameValue, just close
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
          {/* ------------------------------------------------------------------------------ */}
          <div className="folder_dragbar-MSN"
            onDoubleClick={handleExpandStateToggle}
            onTouchStart={handleExpandStateToggleMobile}
            style={{ background: MSNExpand.focusItem ? themeDragBar : '#757579' }}
          >
            <div className="folder_barname-MSN">
              <img src={msnPic} alt="msnPic" />
              <span>MSN</span>
            </div>
            <div className="folder_barbtn-MSN">
              <div onClick={!isTouchDevice ? (e) => {
                e.stopPropagation();
                setMSNExpand(prev => ({ ...prev, hide: true, focusItem: false }));
                StyleHide('MSN');
              } : undefined}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  setMSNExpand(prev => ({ ...prev, hide: true, focusItem: false }));
                  StyleHide('MSN');
                }}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <p className='dash-MSN'></p>
              </div>
              <div
                onClick={!isTouchDevice ? () => handleExpandStateToggle() : undefined}
                onTouchEnd={handleExpandStateToggle}
              >
                <motion.div className={`expand-MSN ${MSNExpand.expand ? 'full' : ''}`}>
                </motion.div>
                {MSNExpand.expand ?
                  (
                    <div className="expand_2-MSN"></div>
                  )
                  :
                  (null)}
              </div>
              <div>
                <p className='x-MSN'
                  onClick={!isTouchDevice ? () => {
                    deleteTap('MSN');
                    setUserName(false);
                    setChatValue('')
                  } : undefined}
                  onTouchEnd={() => {
                    deleteTap('MSN');
                    setUserName(false);
                    setChatValue('')
                  }}
                >
                  ×
                </p>
              </div>
            </div>
          </div>

          <div className="file_edit_container-MSN">
            <p>File<span style={{ left: '-23px' }}>_</span></p>
            <p>Edit<span style={{ left: '-24px' }}>_</span></p>
            <p>View<span style={{ left: '-32px' }}>_</span></p>
            <p>Help<span style={{ left: '-30px' }}>_</span></p>
          </div>
          <div className='groove_div'>
            <div className="chat_name_msn_div"
              onClick={() => setUserName(true)}
            >
              <img src={chat} alt="chat" />

            </div>
            <div className="shake_message"
              onClick={() => {
                ringMsnOff()
              }}
            >
              <img src={nudge} alt="" />
            </div>
            <span>Username: {userNameValue ? userNameValue : 'Anonymous'}</span>
            <div className={`activate_bot ${chatBotActive ? 'active' : ''}`}
              onClick={() => setChatBotActive(!chatBotActive)}
            >
              <span>{chatBotActive ? 'Bot Online' : 'Bot Offline'}</span>
            </div>
          </div>
          <div className="chat_to_div">
            <span>
              Online User: <span>{onlineUser}</span>
            </span>
          </div>

          <div className="folder_content-MSN"
            style={{
              background: !websocketConnection ? 'rgba(0, 0, 0, 0.426)' : '',
            }}
          >
            {!websocketConnection && (
              <div className="reconnect_container">
                <p
                  onClick={() => {
                    connectWebSocket()
                  }}
                >
                  Click here to reconnect
                </p>
              </div>
            )}
            {chatData.length === 0 && (
              <span style={{ position: 'relative', fontSize: '13px' }}>
                LOADING.......
              </span>
            )}
            <div ref={topOfMessagesRef} /> {/* Ref to track the top of the chat container */}
            {loadedMessages?.map((chat, index) => (
              (chat.text || chat.chat || '').length > 0 && (
                <div className='text_container' key={index}>
                  <p>
                    <span style={{ color: chat?.dev ? 'red' : chat.bot ? 'purple' : 'blue' }}>&lt;{chat?.dev ? 'Dev' : (chat.user || chat.name)}&gt;: </span>
                    <span style={{ color: chat?.dev ? 'red' : chat.bot ? 'purple' : '#171616' }}>{chat.text || chat.chat}</span>
                  </p>
                </div>
              )
            ))}

            <div ref={endOfMessagesRef} />
          </div>

          <div className="enter_text_div">
            <textarea
              maxLength={100}
              placeholder='Enter your message here...'
              value={chatValue}
              onChange={(e) => setChatValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
            />
            <button
              style={{ color: sendDisable ? 'grey' : null }}
              disabled={sendDisable}
              onClick={handleSend}
            >
              Send
            </button>
          </div>
          <div className="status_div">
            <p>
              {chatValue.trim().length > 0
                ? `${userNameValue} is typing...`
                : `Last message received on ${lastMessage}`}
            </p>

          </div>
        </div>
      </Draggable>
    </>
  );
}

export default MsnFolder;
