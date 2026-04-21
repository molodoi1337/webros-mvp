let ros;

let cmdVelTopic;
let lightTopic;
let photoTopic;
let manipulatorTopic;
let depthSetpointTopic;
let isDepthSetpointTopic;
let leftJoystick;
let rightJoystick;
let rosImageReader = null;

let linearX = 0;
let angularX = 0;
let linearY = 0;
let angularY = 0;
let linearZ = 0;
let angularZ = 0;
let cameraValue = 0;
let depthValue = 0;

// Сглаживание команд twist_pilot (плавный разгон/торможение)
var TWIST_RAMP_INTERVAL_MS = Math.round(1000 / (parseFloat(localStorage.getItem('twist-ramp-interval')) || 33));
var TWIST_ACCEL_RATE = parseFloat(localStorage.getItem('twist-accel-rate')) || 1.0;
var TWIST_DECEL_RATE = parseFloat(localStorage.getItem('twist-decel-rate')) || 3.5;
const TWIST_EPSILON = 0.0001;
let twistRampTimer = null;
const twistCurrent = {
    linear: { x: 0, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0 },
};
const twistTarget = {
    linear: { x: 0, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0 },
};

var twistSmoothEnabled = localStorage.getItem('twist-smooth-enabled') !== 'false';

function restartTwistRampTimer() {
    if (twistRampTimer) {
        clearInterval(twistRampTimer);
        twistRampTimer = null;
    }
    if (ros && cmdVelTopic) {
        twistRampTimer = setInterval(publishSmoothedTwist, TWIST_RAMP_INTERVAL_MS);
    }
}

var isConnect = false;


let js_size = 85

let linXLimit = parseFloat(localStorage.getItem('linX-limit')) || 1.0;
let linYLimit = parseFloat(localStorage.getItem('linY-limit')) || 1.0;
let linZLimit = parseFloat(localStorage.getItem('linZ-limit')) || 1.0;
let angXLimit = parseFloat(localStorage.getItem('angX-limit')) || 1.0;
let angYLimit = parseFloat(localStorage.getItem('angY-limit')) || 1.0;
let angZLimit = parseFloat(localStorage.getItem('angZ-limit')) || 1.0;

const axisLimitIds = ['linX', 'linY', 'linZ', 'angX', 'angY', 'angZ'];
const axisLimitUnits = { linX: 'm/s', linY: 'm/s', linZ: 'm/s', angX: 'rad/s', angY: 'rad/s', angZ: 'rad/s' };
const axisLimitVars = { linX: v => linXLimit = v, linY: v => linYLimit = v, linZ: v => linZLimit = v,
                        angX: v => angXLimit = v, angY: v => angYLimit = v, angZ: v => angZLimit = v };

for (const axis of axisLimitIds) {
    document.getElementById(`${axis}-limit`).addEventListener('input', function() {
        axisLimitVars[axis](parseFloat(this.value));
        document.getElementById(`${axis}-limit-value`).textContent = `${parseFloat(this.value).toFixed(1)} ${axisLimitUnits[axis]}`;
        localStorage.setItem(`${axis}-limit`, this.value);
    });
}

function handleUiOnRosConnection(isConnected) {
    const compass = document.querySelector('.compass-box');
    const connectBtn = document.querySelector('.connection-form');
    const settingsPanel = document.querySelector('.connection-settings');

    if (isConnected) {
        compass?.classList.add('show');      
        connectBtn?.classList.add('hide');   
        setTimeout(() => connectBtn && (connectBtn.style.display = 'none'), 400);
        settingsPanel?.classList.add('hide');
    } else {                               
            compass?.classList.remove('show');
    if (connectBtn) {
        connectBtn.style.display = '';     
        connectBtn.classList.remove('hide');
    }
    settingsPanel?.classList.remove('hide');
    }
}

function connectToROS() {
    if (isConnect === false){
        const connBtn = document.getElementById('connection-form');
        connBtn.classList.remove('error');
        connBtn.classList.add('connecting');
        connBtn.textContent = "Connecting...";
        const hostInput = document.getElementById('rosbridge-host');
        const portInput = document.getElementById('rosbridge-port');
        const rbHost = hostInput && hostInput.value
            ? hostInput.value
            : (typeof ROSBRIDGE_HOST !== 'undefined' && ROSBRIDGE_HOST !== ''
                ? ROSBRIDGE_HOST
                : window.location.hostname);
        const rbPort = portInput && portInput.value
            ? portInput.value
            : (typeof ROSBRIDGE_PORT !== 'undefined' && ROSBRIDGE_PORT !== ''
                ? ROSBRIDGE_PORT
                : '9090');
        const rosbridgeAddress = "ws://" + rbHost + ":" + rbPort;
        ros = new ROSLIB.Ros({
            url: rosbridgeAddress
        });
        ros.on('connection', function () {
            handleUiOnRosConnection(true);
            // set_pointer_angle('roll', 44);
            set_pointer_angle('pitch', 0);
            set_pointer_angle('yaw',0);
            rotation_object('vehicle-up-img', 0);
            rotation_object('vehicle-side-img', 0);
            set_text_info_value('depth-value', 0)
            setupTopics();
            setupSubscribers();
            // Отправляем нейтраль на манипулятор при подключении
            const cfg = window.controlParams || loadControlParams();
            updateManipulator(cfg.manipulator_neutral);
            updateCamera(90);
            if (!rosImageReader) {
                rosImageReader = new RosImageReader('video', '/camera/image_raw/compressed');
            }
            if (platform === 'mobile')
                {setupJoysticks()}
            console.log('Connected to rosbridge server.');
            const connBtn = document.getElementById('connection-form');
            connBtn.textContent = "Connected to ROS";
            connBtn.classList.remove('error');
            connBtn.classList.remove('connecting');
            if (typeof updateArmVignette === 'function') updateArmVignette();
        });

        ros.on('error', function (error) {
            console.error('Error connecting to rosbridge server:', error);
            const connBtn = document.getElementById('connection-form');
            connBtn.textContent = "ROS connection failed";
            connBtn.classList.remove('connecting');
            connBtn.classList.add('error');
            handleUiOnRosConnection(false);
            isConnect = false;
            if (typeof updateArmVignette === 'function') updateArmVignette();
        });

        ros.on('close', function () {
            console.log('Connection to rosbridge server closed.');
            const connBtn = document.getElementById('connection-form');
            connBtn.textContent = "Connection to ROS server closed";
            connBtn.classList.remove('connecting');
            connBtn.classList.add('error');
            handleUiOnRosConnection(false);
            isConnect = false;
            if (typeof updateArmVignette === 'function') updateArmVignette();
        });
        isConnect = true;
    }
}

function createRosTopic(msgType, suffix) {
    const name = `${suffix}`.replace(/\/{2,}/g, '/');
    const topic = new ROSLIB.Topic({
        ros: ros,
        name: name,
        messageType: msgType,
    });
    topic.publish()
    return topic
}

function createRosSubscriber(msgType, topicName, callback){
    const name = `${topicName}`.replace(/\/{2,}/g, '/');
    const topic = new ROSLIB.Topic({
        ros: ros,
        name,
        messageType: msgType,
        queue_length: 10,
    });
    topic.subscribe(callback);
    return topic;
}

function setupSubscribers(){
headingTopic = createRosSubscriber(
    'std_msgs/Int16', 'modbus/sensor/heading',
    (msg) => {
        heading = msg.data % 360;
        set_pointer_angle('yaw', heading)
        rotation_object('vehicle-up-img', heading);
    }
);
pitchTopic = createRosSubscriber(
    'std_msgs/Int16', 'modbus/sensor/pitch',
    (msg) => {
        pitch = msg.data;
        if (pitch > 180) {
            pitch = pitch - 360;
        }
        set_pointer_angle('pitch', pitch);
        rotation_object('vehicle-side-img', pitch)
    }
);
depthTopic = createRosSubscriber(
    'std_msgs/Int16', 'modbus/sensor/depth',
    (msg) => {
        depthValue = msg.data;
        set_text_info_value('depth-value', depthValue)
        if (depth_hold_active) {
            updateDepthSetpoint(depthValue);
        }
    }
);
cameraTopic = createRosSubscriber(
    'std_msgs/Int16', 'modbus/servo/camera_rotate',
    (msg) => {
        cameraValue = msg.data;
    }
);
}

function setupTopics() {
    cmdVelTopic = createRosTopic('geometry_msgs/Twist', 'twist_pilot');
    manipulatorTopic = createRosTopic('std_msgs/Int16', 'modbus/servo/manipulator/write');
    lightTopic = createRosTopic('std_msgs/Int16',  'modbus/servo/light/write');
    cameraServoTopic = createRosTopic('std_msgs/Int16', 'modbus/servo/camera_rotate/write');
    photoTopic = createRosTopic('std_msgs/Empty', 'trigger_photo')
    rerordingTopic = createRosTopic('std_msgs/Bool', 'is_recording')
    depthSetpointTopic = createRosTopic('std_msgs/Int16', 'depth_setpoint')
    isDepthSetpointTopic = createRosTopic('std_msgs/Bool', 'is_depth_setpoint')
}

// Виртуальные оси для мобильных джойстиков (0..3, как в биндах)
const virtualJoystickAxes = {
    0: 0, // левый стик – горизонталь
    1: 0, // левый стик – вертикаль
    2: 0, // правый стик – горизонталь
    3: 0  // правый стик – вертикаль
};

function applyVirtualJoystickAxes() {
    const axesBindings = (window.joystickAxesBindings) ? window.joystickAxesBindings : {
        0: 'angZ',
        1: 'linX',
        2: null,
        3: 'angY',
    };

    Object.keys(virtualJoystickAxes).forEach((i) => {
        const axisIndex = parseInt(i, 10);
        const axisKey = axesBindings[axisIndex];
        const value = virtualJoystickAxes[axisIndex];
        if (axisKey && movementManager[axisKey]) {
            movementManager[axisKey].set(value);
        }
    });

    updateTwistCommand();
}

function setupJoysticks() {
    const leftOptions = {
        zone: document.getElementById('left-joystick'),
        mode: 'static',
        position: {left: '50%', top: '50%'},
        size: js_size,
        multitouch: true,
        maxNumberOfNipples: 1
    };

    leftJoystick = nipplejs.create(leftOptions);

    leftJoystick.on('move', function (evt, data) {
        const maxVal = 1.0;
        const angle = data.angle.radian;
        const force = Math.min(data.force, 1.0);

        // Преобразуем круг в две оси: горизонталь (0) и вертикаль (1)
        const x = clamp(Math.cos(angle) * maxVal * force, -1.0, 1.0);
        const y = clamp(Math.sin(angle) * maxVal * force, -1.0, 1.0);

        virtualJoystickAxes[0] = x;
        virtualJoystickAxes[1] = y;

        applyVirtualJoystickAxes();
    });

    leftJoystick.on('end', function () {
        virtualJoystickAxes[0] = 0.0;
        virtualJoystickAxes[1] = 0.0;
        applyVirtualJoystickAxes();
    });

    
    const rightOptions = {
        zone: document.getElementById('right-joystick'),
        position: {left: '50%', top: '50%'},
        mode: 'static',
        size: js_size,
        multitouch: true,
        maxNumberOfNipples: 1
    };

    rightJoystick = nipplejs.create(rightOptions);
    
    rightJoystick.on('move', function (evt, data) {
        const maxVal = 1.0;
        const angle = data.angle.radian;
        const force = Math.min(data.force, 1.0);

        // Преобразуем круг в две оси: горизонталь (2) и вертикаль (3)
        const x = clamp(Math.cos(angle) * maxVal * force, -1.0, 1.0);
        const y = clamp(Math.sin(angle) * maxVal * force, -1.0, 1.0);

        virtualJoystickAxes[2] = x;
        virtualJoystickAxes[3] = y;

        applyVirtualJoystickAxes();
    });

    rightJoystick.on('end', function () {
        virtualJoystickAxes[2] = 0.0;
        virtualJoystickAxes[3] = 0.0;
        applyVirtualJoystickAxes();
    });
}

function updateTwistCommand() {
    if (!(ros && cmdVelTopic)) {
        return;
    }

    if (!window.isArmed) {
        twistTarget.linear.x = 0;
        twistTarget.linear.y = 0;
        twistTarget.linear.z = 0;
        twistTarget.angular.x = 0;
        twistTarget.angular.y = 0;
        twistTarget.angular.z = 0;
    } else {
        twistTarget.linear.x = parseFloat(linearX) || 0;
        twistTarget.linear.y = parseFloat(linearY) || 0;
        twistTarget.linear.z = parseFloat(linearZ) || 0;
        twistTarget.angular.x = parseFloat(angularX) || 0;
        twistTarget.angular.y = parseFloat(angularY) || 0;
        twistTarget.angular.z = parseFloat(angularZ) || 0;
    }

    if (!twistRampTimer) {
        twistRampTimer = setInterval(publishSmoothedTwist, TWIST_RAMP_INTERVAL_MS);
        publishSmoothedTwist();
    }
}

function stepTowards(current, target, dtSec) {
    const delta = target - current;
    if (Math.abs(delta) <= TWIST_EPSILON) {
        return target;
    }

    const rate = Math.abs(target) > Math.abs(current) ? TWIST_ACCEL_RATE : TWIST_DECEL_RATE;
    const maxStep = rate * dtSec;
    if (Math.abs(delta) <= maxStep) {
        return target;
    }

    return current + Math.sign(delta) * maxStep;
}

function publishSmoothedTwist() {
    if (!(ros && cmdVelTopic)) {
        if (twistRampTimer) {
            clearInterval(twistRampTimer);
            twistRampTimer = null;
        }
        return;
    }

    let reachedTarget = true;

    if (twistSmoothEnabled) {
        const dtSec = TWIST_RAMP_INTERVAL_MS / 1000;
        twistCurrent.linear.x = stepTowards(twistCurrent.linear.x, twistTarget.linear.x, dtSec);
        twistCurrent.linear.y = stepTowards(twistCurrent.linear.y, twistTarget.linear.y, dtSec);
        twistCurrent.linear.z = stepTowards(twistCurrent.linear.z, twistTarget.linear.z, dtSec);
        twistCurrent.angular.x = stepTowards(twistCurrent.angular.x, twistTarget.angular.x, dtSec);
        twistCurrent.angular.y = stepTowards(twistCurrent.angular.y, twistTarget.angular.y, dtSec);
        twistCurrent.angular.z = stepTowards(twistCurrent.angular.z, twistTarget.angular.z, dtSec);

        if (Math.abs(twistCurrent.linear.x - twistTarget.linear.x) > TWIST_EPSILON) reachedTarget = false;
        if (Math.abs(twistCurrent.linear.y - twistTarget.linear.y) > TWIST_EPSILON) reachedTarget = false;
        if (Math.abs(twistCurrent.linear.z - twistTarget.linear.z) > TWIST_EPSILON) reachedTarget = false;
        if (Math.abs(twistCurrent.angular.x - twistTarget.angular.x) > TWIST_EPSILON) reachedTarget = false;
        if (Math.abs(twistCurrent.angular.y - twistTarget.angular.y) > TWIST_EPSILON) reachedTarget = false;
        if (Math.abs(twistCurrent.angular.z - twistTarget.angular.z) > TWIST_EPSILON) reachedTarget = false;
    } else {
        twistCurrent.linear.x = twistTarget.linear.x;
        twistCurrent.linear.y = twistTarget.linear.y;
        twistCurrent.linear.z = twistTarget.linear.z;
        twistCurrent.angular.x = twistTarget.angular.x;
        twistCurrent.angular.y = twistTarget.angular.y;
        twistCurrent.angular.z = twistTarget.angular.z;
    }

    const pub_data = new ROSLIB.Message({
        linear: {
            x: parseFloat(twistCurrent.linear.x.toFixed(2)),
            y: parseFloat(twistCurrent.linear.y.toFixed(2)),
            z: parseFloat(twistCurrent.linear.z.toFixed(2))
        },
        angular: {
            x: parseFloat(twistCurrent.angular.x.toFixed(2)),
            y: parseFloat(twistCurrent.angular.y.toFixed(2)),
            z: parseFloat(twistCurrent.angular.z.toFixed(2))
        }
    });
    if (!window.playbackActive) {
        cmdVelTopic.publish(pub_data);
    }

    if (reachedTarget) {
        clearInterval(twistRampTimer);
        twistRampTimer = null;
    }
}

function updateLight(data) {
    if (ros && lightTopic) {
        const intValue = Math.round(Number(data));
        const pub_data = new ROSLIB.Message({data: intValue});
        lightTopic.publish(pub_data);
    }
}

// Уровень яркости фонаря: 0..steps, маппинг в диапазон PWM [flashlight_off..flashlight_on]
window.updateLightLevel = function (level) {
    const cfg = (window.controlParams) ? window.controlParams : {};
    const minVal = Number.isFinite(cfg.flashlight_off) ? cfg.flashlight_off : 1000;
    const maxVal = Number.isFinite(cfg.flashlight_on) ? cfg.flashlight_on : 2000;
    const stepsRaw = Number.isFinite(cfg.flashlight_steps) ? cfg.flashlight_steps : 1;

    const steps = Math.max(1, Math.floor(stepsRaw));
    const clampedLevel = Math.max(0, Math.min(steps, level));
    const stepSize = (maxVal - minVal) / steps;
    const mapped = Math.round(minVal + stepSize * clampedLevel);

    updateLight(mapped);
};

function updateRecording(data) {
    if (ros && rerordingTopic) {
        const pub_data = new ROSLIB.Message({data: data});
        rerordingTopic.publish(pub_data);
    }
}

function triggerPhoto() {
    if (ros && photoTopic) {
        photoTopic.publish(new ROSLIB.Message({}));
    }
}

window.onPhotoClick = triggerPhoto;

function updateManipulator(data) {
    if (ros && manipulatorTopic) {
        const pub_data = new ROSLIB.Message({data: data});
        manipulatorTopic.publish(pub_data);
    }
}

function updateIsDepthSetpoint(active) {
    if (ros && isDepthSetpointTopic) {
        const pub_data = new ROSLIB.Message({data: active});
        isDepthSetpointTopic.publish(pub_data);
    }
}

function updateDepthSetpoint(data) {
    if (ros && depthSetpointTopic) {
        const pub_data = new ROSLIB.Message({data: data});
        depthSetpointTopic.publish(pub_data);
    }
}

function updateCamera(data) {
  if (ros && cameraServoTopic) {
    const cfg = (window.controlParams) ? window.controlParams : {};
    const minDeg = Number.isFinite(cfg.camera_min_deg) ? cfg.camera_min_deg : 0;
    const maxDeg = Number.isFinite(cfg.camera_max_deg) ? cfg.camera_max_deg : 180;
    const nextValue = cameraValue + data;
    if (nextValue <= maxDeg && nextValue >= minDeg){
        const pub_data = new ROSLIB.Message({data: nextValue});
        cameraServoTopic.publish(pub_data);
    }
    }
}
updateTwistCommand();
