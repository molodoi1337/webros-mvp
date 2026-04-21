cmake_minimum_required(VERSION 3.8)
project(web_bringup)

find_package(ament_cmake REQUIRED)

# Install launch files
install(DIRECTORY
  launch
  DESTINATION share/${PROJECT_NAME}
)

# Install scripts
install(PROGRAMS
  scripts/start_rosbridge.sh
  DESTINATION lib/${PROJECT_NAME}
)

ament_package()
