from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    # Declare arguments
    port_arg = DeclareLaunchArgument(
        'port',
        default_value='9090',
        description='WebSocket port for rosbridge'
    )
    
    address_arg = DeclareLaunchArgument(
        'address',
        default_value='',
        description='Address to bind (empty = all interfaces)'
    )

    # Rosbridge WebSocket node
    rosbridge_node = Node(
        package='rosbridge_server',
        executable='rosbridge_websocket',
        name='rosbridge_websocket',
        parameters=[{
            'port': 9091,
            'address': LaunchConfiguration('address'),
            'delay_between_messages': 0.0,
            'max_message_size': 10000000,
            'unregister_timeout': 10.0,
        }],
        output='screen',
    )

    # ROS API node (provides services for topic/node/service listing)
    rosapi_node = Node(
        package='rosapi',
        executable='rosapi_node',
        name='rosapi',
        output='screen',
    )

    return LaunchDescription([
        port_arg,
        address_arg,
        rosbridge_node,
        rosapi_node,
    ])

