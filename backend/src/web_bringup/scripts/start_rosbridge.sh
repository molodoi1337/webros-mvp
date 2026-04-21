#!/bin/bash
# Скрипт для запуска rosbridge с поддержкой кастомных сообщений

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== WebRQT Rosbridge Launcher ===${NC}"

# Source ROS2
if [ -f "/opt/ros/jazzy/setup.bash" ]; then
    echo -e "${YELLOW}Sourcing ROS2 Jazzy...${NC}"
    source /opt/ros/jazzy/setup.bash
elif [ -f "/opt/ros/humble/setup.bash" ]; then
    echo -e "${YELLOW}Sourcing ROS2 Humble...${NC}"
    source /opt/ros/humble/setup.bash
elif [ -f "/opt/ros/iron/setup.bash" ]; then
    echo -e "${YELLOW}Sourcing ROS2 Iron...${NC}"
    source /opt/ros/iron/setup.bash
else
    echo "ERROR: ROS2 installation not found!"
    exit 1
fi

# Source user workspaces with custom messages
# Добавьте сюда пути к вашим workspace с кастомными сообщениями
CUSTOM_WORKSPACES=(
    "$HOME/ros2_ws/web_ws/install/setup.bash"
    "$HOME/ros2_ws/install/setup.bash"
    # Добавьте другие workspace при необходимости
)

for ws in "${CUSTOM_WORKSPACES[@]}"; do
    if [ -f "$ws" ]; then
        echo -e "${YELLOW}Sourcing workspace: $ws${NC}"
        source "$ws"
    fi
done

echo -e "${GREEN}Starting rosbridge_server...${NC}"
echo "WebSocket will be available at ws://localhost:9090"
echo ""

# Запуск rosbridge
ros2 launch web_bringup rosbridge.launch.py "$@"

