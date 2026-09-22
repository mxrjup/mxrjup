import { useEffect, useState, useContext } from 'react';
import '../css/Notification.css';
import { motion, AnimatePresence } from 'framer-motion';
import UseContext from '../Context';
import icon_wins95 from '../assets/95icon.png';

function Notification() {
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);

  const {
    notiOn, setNotiOn,
  } = useContext(UseContext);

  // Update screen width on resize
  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);

    // Show initial notification delay
    const initialTimeout = setTimeout(() => setNotiOn(true), 6000);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(initialTimeout);
    };
  }, []);

  // Automatically hide notifications after a duration
  useEffect(() => {
    if (!notiOn) return;

    const timeoutId = setTimeout(() => setNotiOn(false), 12000);

    return () => clearTimeout(timeoutId);
  }, [notiOn]);


  return (
    <AnimatePresence>
      {notiOn && (
        <motion.div
          key="Noti"
          className="noti_container"
          onClick={() => setNotiOn(false)}
          initial={screenWidth <= 500 ? { top: -500 } : { right: -500 }}
          animate={screenWidth <= 500 ? { top: 16 } : { right: 16 }}
          exit={{
            top: screenWidth <= 500 ? -500 : undefined,
            right: screenWidth > 500 ? -500 : undefined,
            transition: { type: 'tween', duration: 1 },
          }}
          transition={{ type: 'spring', stiffness: 90, damping: 13 }}
        >
          <div className="noti_icon">
            <img src={icon_wins95} alt="" />
            <p>Notification</p>
          </div>
          <div className="noti_message">
            <p>Welcome to the family computer, you can add your own content here !</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default Notification;
