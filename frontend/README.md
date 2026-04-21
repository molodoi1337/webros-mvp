# WebROS



## Getting started

Что такое сервер ROSBridge?
Проще говоря, rosbridge_server обеспечивает мост между ROS 2 и веб-приложениями или приложениями, не относящимися к ROS, позволяя вам отправлять и получать сообщения ROS через Интернет или из других систем, не относящихся к ROS. Это обычно используется, когда вы хотите создать веб-панели или интерфейсы для удаленного управления роботом или визуализации его данных.

Некоторые из основных функций rosbridge_server включают:

1. Создание соединения WebSocket, которое позволяет осуществлять двунаправленную связь между роботом и веб-браузерами.

2. раскрытие функциональности публикации/подписки ROS, позволяющей веб-приложениям публиковать и подписываться на темы ROS

3. Устранение разрыва между TCP/UDP-сокетами ROS и веб-браузерами, которые не имеют прямого доступа к этим протоколам.

Установка сервера ROSBridge

```shell
sudo apt install ros-iron-rosbridge-server
```

Запуск
```shell
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

Для создания приборной панели мы будем использовать обычные HTML и JavaScript, но вы можете использовать любой веб-фреймворк, если он может взаимодействовать с roslibjs.

Существуют и другие способы взаимодействия с rosbridge, например, с помощью Python, Rust или Java. Это поможет вам разрабатывать приложения и системы, взаимодействующие с вашим роботом, например, создать сервис для обновления статуса доставки еды для автономного робота-доставщика, чтобы и пользователи, и ресторан знали, когда еда будет доставлена.

По сути, если вам нужно выйти за пределы экосистемы ROS 2 и взаимодействовать с другими типами программного обеспечения, вы можете легко использовать rosbridge с его стандартной реализацией WebSocket, а не работать напрямую с необработанным DDS.

Пример `index.html/css/js`
```html
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ROS Web Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/roslib@1/build/roslib.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/nipplejs/0.9.0/nipplejs.min.js"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f0f0f0;
        }

        .dashboard {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
        }

        .connection-form {
            width: 100%;
            margin-bottom: 20px;
        }

        .joystick-container {
            width: 200px;
            height: 200px;
            background-color: #ddd;
            border-radius: 50%;
            position: relative;
            overflow: hidden;
        }

        .position-display {
            width: 200px;
            padding: 10px;
            background-color: #fff;
            border-radius: 5px;
        }
    </style>
</head>

<body>
    <div class="connection-form">
        <input type="text" id="rosbridge-address" placeholder="ws://localhost:9090">
        <button onclick="connectToROS()">Connect</button>
    </div>
    <div class="dashboard">
        <div class="joystick-container" id="joystick"></div>
        <div class="position-display">
            <h3>Position</h3>
            <p>X: <span id="position-x">0</span></p>
            <p>Y: <span id="position-y">0</span></p>
        </div>
    </div>

    <script>
        let ros;
        let cmdVelTopic;
        let joystick;

        function connectToROS() {
            const rosbridgeAddress = document.getElementById('rosbridge-address').value;
            ros = new ROSLIB.Ros({
                url: rosbridgeAddress
            });

            ros.on('connection', function () {
                console.log('Connected to rosbridge server.');
                setupTopics();
            });

            ros.on('error', function (error) {
                console.error('Error connecting to rosbridge server:', error);
            });

            ros.on('close', function () {
                console.log('Connection to rosbridge server closed.');
            });
        }

        function setupTopics() {
            // Set up cmd_vel topic
            cmdVelTopic = new ROSLIB.Topic({
                ros: ros,
                name: '/cmd_vel',
                messageType: 'geometry_msgs/Twist'
            });

            // Set up odometry topic
            const odomTopic = new ROSLIB.Topic({
                ros: ros,
                name: '/odom',
                messageType: 'nav_msgs/Odometry'
            });

            odomTopic.subscribe(function (message) {
                document.getElementById('position-x').textContent = message.pose.pose.position.x.toFixed(2);
                document.getElementById('position-y').textContent = message.pose.pose.position.y.toFixed(2);
            });

            // Set up joystick
            setupJoystick();
        }

        function setupJoystick() {
            const options = {
                zone: document.getElementById('joystick'),
                mode: 'static',
                position: {left: '50%', top: '50%'},
                color: 'blue',
                size: 150
            };

            joystick = nipplejs.create(options);

            joystick.on('move', function (evt, data) {
                const maxSpeed = 1.0; // m/s
                const maxTurn = 1.0; // rad/s

                const linear = Math.sin(data.angle.radian) * maxSpeed * data.distance / 75;
                const angular = -Math.cos(data.angle.radian) * maxTurn * data.distance / 75;

                const twist = new ROSLIB.Message({
                    linear: {x: linear, y: 0, z: 0},
                    angular: {x: 0, y: 0, z: angular}
                });

                cmdVelTopic.publish(twist);
            });

            joystick.on('end', function () {
                const twist = new ROSLIB.Message({
                    linear: {x: 0, y: 0, z: 0},
                    angular: {x: 0, y: 0, z: 0}
                });

                cmdVelTopic.publish(twist);
            });
        }
    </script>
</body>

</html>
```