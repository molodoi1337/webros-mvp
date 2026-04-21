class SwipeDetector {
  constructor() {
    this.startY = 0;
    this.endY = 0;
    this.startTime = 0;
    this.isTracking = false;
    this.threshold = 50; // Минимальное расстояние свайпа (пикселей)
    this.maxTime = 500; // Максимальное время свайпа (мс)
    this.ignoreNextClick = false; 
    
    this.initEvents();
  }
  
  initEvents() {
    // Для сенсорных устройств
    const video = document.getElementById('video-swipe');
    video.addEventListener('touchstart', this.handleStart.bind(this), {passive: false});
    video.addEventListener('touchmove', this.handleMove.bind(this), {passive: false});
    video.addEventListener('touchend', this.handleEnd.bind(this), {passive: true});
  }
  
  handleStart(e) {
    const y = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    this.startY = y;
    this.endY = y;
    this.startTime = Date.now();
    this.isTracking = true;

    if (e.type === 'touchstart') {
      e.preventDefault();
    }
  }
  
  handleMove(e) {
    if (!this.isTracking) return;

    this.endY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

    if (Math.abs(this.startY - this.endY) > 10) {
      e.preventDefault();
    }
  }
  
  handleEnd(e) {
    if (!this.isTracking) return;
    this.isTracking = false;

    const distance = this.endY - this.startY; // Обратите внимание - теперь endY минус startY
    const duration = Date.now() - this.startTime;

    // Свайп вверх (как было)
    if (this.startY - this.endY > this.threshold && duration < this.maxTime) {
      this.onSwipeUp();
      this.ignoreNextClick = true;
      setTimeout(() => this.ignoreNextClick = false, 300);
    }
    // Новый обработчик свайпа вниз
    else if (distance > this.threshold && duration < this.maxTime) {
      this.onSwipeDown();
      this.ignoreNextClick = true;
      setTimeout(() => this.ignoreNextClick = false, 300);
    }
  }
  
  onSwipeUp() {
    console.log('Свайп вверх распознан!');
    updateCamera(45);
  }
  
  // Новый метод для свайпа вниз
  onSwipeDown() {
    console.log('Свайп вниз распознан!');
    updateCamera(-45);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new SwipeDetector();
});
