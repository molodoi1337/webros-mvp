'use strict';

class RosImageReader {
    constructor(targetElementId = 'video', topicName = '/camera/image_raw/compressed') {
        this.topicName = topicName;
        this.subscriber = null;
        this.active = false;

        this.videoEl = document.getElementById(targetElementId);
        const wrapper = this.videoEl?.parentElement;

        this.imgEl = document.createElement('img');
        this.imgEl.id = 'ros-image-canvas';
        this.imgEl.style.display = 'none';

        this.tsOverlay = document.createElement('div');
        this.tsOverlay.id = 'ros-image-timestamp';
        this.tsOverlay.className = 'ros-image-timestamp';
        this.tsOverlay.style.display = 'none';

        if (wrapper) {
            wrapper.appendChild(this.imgEl);
            wrapper.appendChild(this.tsOverlay);
        }

        this.frameCount = 0;
        this.lastFpsTime = performance.now();
        this.fps = 0;
        this.lastFrameTimestampNs = null;
        this.lastFrameFormatted = '';
    }

    start() {
        if (this.active) return;
        if (typeof ros === 'undefined' || !ros) {
            console.warn('RosImageReader: ROS not connected');
            return;
        }

        this.active = true;
        this.imgEl.style.display = 'block';
        this.videoEl.style.display = 'none';
        this.tsOverlay.style.display = 'block';

        this.subscriber = createRosSubscriber(
            'sensor_msgs/CompressedImage',
            this.topicName,
            (msg) => this._onImage(msg)
        );

        console.log(`RosImageReader: subscribed to ${this.topicName}`);
    }

    stop() {
        if (!this.active) return;
        this.active = false;

        if (this.subscriber) {
            this.subscriber.unsubscribe();
            this.subscriber = null;
        }

        this.imgEl.style.display = 'none';
        this.videoEl.style.display = '';
        this.tsOverlay.style.display = 'none';
        this.lastFrameTimestampNs = null;
        this.lastFrameFormatted = '';
        console.log('RosImageReader: stopped');
    }

    toggle() {
        this.active ? this.stop() : this.start();
    }

    setTopic(topicName) {
        const wasActive = this.active;
        if (wasActive) this.stop();
        this.topicName = topicName;
        if (wasActive) this.start();
    }

    _onImage(msg) {
        if (!this.active) return;

        const format = msg.format.includes('png') ? 'png' : 'jpeg';
        this.imgEl.src = `data:image/${format};base64,${msg.data}`;

        const stamp = msg?.header?.stamp;
        if (stamp && (stamp.sec != null)) {
            const sec = Number(stamp.sec) || 0;
            const nsec = Number(stamp.nanosec ?? stamp.nsec) || 0;
            this.lastFrameTimestampNs = sec * 1_000_000_000 + nsec;
            this.lastFrameFormatted = RosImageReader.formatStamp(sec, nsec);
            this.tsOverlay.textContent = `frame: ${this.lastFrameFormatted}`;
        }

        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsTime = now;
        }
    }

    static formatStamp(sec, nsec) {
        const d = new Date(sec * 1000);
        const hh = String(d.getUTCHours()).padStart(2, '0');
        const mm = String(d.getUTCMinutes()).padStart(2, '0');
        const ss = String(d.getUTCSeconds()).padStart(2, '0');
        const ms = String(Math.floor(nsec / 1e6)).padStart(3, '0');
        return `${hh}:${mm}:${ss}.${ms}Z`;
    }
}

window.RosImageReader = RosImageReader;
