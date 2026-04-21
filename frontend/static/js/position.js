// Устанавливает указатель на нужный угол
function set_pointer_angle(dial_id, angle) {
    const dial = document.getElementById(dial_id);
    const element = dial.querySelector('label');
    let side = element.classList[1];

    if (side === "right") {
        side = 1;
    }
    if (side === "left") {
        side = -1;
    }
    if (!dial) return;
    
    // Находим указатель и текстовый элемент внутри dial
    const pointer = dial.querySelector('.dial-marker-arrow');
    const angleText = dial.querySelector('.dial-text span');

    const rotationAngle = dial_id === 'pitch' ? -angle : angle;
    
    if (pointer) {
        pointer.style.transform = `rotate(${-side*90+side*rotationAngle}deg)`;
    }
    if (side==="center") {
        pointer.style.transform = `rotate(${angle-180}deg)`;
    }
    
    if (angleText) {
        angleText.textContent = angle;
    }
}

function set_text_info_value(dial_id, value) {
    const element = document.getElementById(dial_id);
    const offset = window.depthInfoValue || 0;
    const result = (value / 100 + offset).toFixed(2);
    element.textContent = result + " м.";
}
function rotation_object(element_id, angle) {
    const scale = document.getElementById(element_id);
    // Для боковой проекции используем тот же инвертированный знак, что и для стрелки pitch
    if (element_id==='vehicle-side-img'){scale.style.transform = `rotate(${angle}deg)`;}
    else{scale.style.transform = `rotate(${angle}deg)`;}
}
let dialPitchLayout = null
let dialRollLayout = null
let dialYawLayout = null

let rotatedSideVehicleLayout = null
let rotatedUpVehicleLayout = null

document.addEventListener('DOMContentLoaded', () => {
    function makeDial(id, labelText){
        const positionMap = {
            "pitch": 'left',
            "yaw": 'center',
            "roll": 'right'
        };
        const dial = document.createElement('div');
        dial.className = 'dial'; dial.id = id;

        const ptr  = document.createElement('div');
        ptr.className = 'dial-marker dial-marker-arrow ';
        dial.appendChild(ptr);

        const lbl  = document.createElement('label');
        lbl.className = `dial-text ${positionMap[id]}`;
        // lbl.className = `dial-text ${id==='pitch' ? 'left':'right'}`;
        lbl.innerHTML = `${labelText}:<br><span>0</span>°`;
        dial.appendChild(lbl);

        return dial;
    }

    function makePicture(gridClassName, gridPictureName, src_picture) {
        const picture = document.createElement('div'); 
        picture.className = gridClassName; 
        const picture_prt  = document.createElement('img');
        picture_prt.className = gridPictureName; picture_prt.id = src_picture.split('/').pop().replace(/\.[^/.]+$/, '');
        picture_prt.src = src_picture;
        picture.appendChild(picture_prt);
        return picture
    }

    function makeTextInformation(gridClassName, elementClassName, textValue) {
        const wrapper = document.createElement('div');
        wrapper.className = 'grid-button';
        wrapper.style.position = 'relative';

        const btn = document.createElement('button');
        btn.className = platform === 'mobile' ? 'grid-button mobile' : 'grid-button pc';
        btn.dataset.name = 'depth_hold';
        btn.dataset.mode = 'toggle';
        btn.dataset.active = 'false';

        const label = document.createElement('div');
        label.className = elementClassName;
        label.id = elementClassName;
        label.textContent = textValue/100 + " м.";
        btn.appendChild(label);

        btn.addEventListener('click', () => {
            const newActive = btn.dataset.active !== 'true';
            btn.dataset.active = String(newActive);
            if (newActive) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
            window.dispatchEvent(new CustomEvent('buttontoggle', {
                detail: { name: 'depth_hold', active: newActive }
            }));
        });

        wrapper.appendChild(btn);

        const container = document.createElement('div');
        container.className = gridClassName;
        container.appendChild(wrapper);
        return container;
    }
    

    const dialPitch = makeDial('pitch', 'диф.');
    // const dialRoll  = makeDial('roll',  'крен');
    const dialYaw  = makeDial('yaw',  'курс');
    const depth = makeTextInformation('depth-info', 'depth-value', '1')

    const vehicleType = localStorage.getItem('vehicle-type') || 'jackass';
    const vehicle = makePicture('grid-vehicle', 'jackass-object', `/static/img/${vehicleType}-side.png`);
    const up_vehicle = makePicture('grid-vehicle', 'jackass-object', `/static/img/${vehicleType}-up.png`);
    vehicle.querySelector('img').id = 'vehicle-side-img';
    up_vehicle.querySelector('img').id = 'vehicle-up-img';

    if (platform === "mobile") {
        dialPitchLayout = new GridItem(grid, 1, 4, 4, 4, dialPitch);
        depthLayout = new GridItem(grid, 3, -5, 3, 4, depth);
        dialYawLayout = new GridItem(grid, 1, 1, 4, 4, dialYaw);
        rotatedSideVehicleLayout = new GridItem(grid, 2, 4, 2, 4, vehicle, false);
        rotatedUpVehicleLayout = new GridItem(grid, 1, 1, 4, 4, up_vehicle, false);
    }else if (platform === "steamdeck") {
        dialPitchLayout = new GridItem(grid, 1, 4, 4, 4, dialPitch);
        depthLayout = new GridItem(grid, 5, 1, 1, 4, depth);
        // dialRollLayout = new GridItem(grid, 1, 1, 4, 4, dialRoll);
        dialYawLayout = new GridItem(grid, 1, 1, 4, 4, dialYaw);
        rotatedSideVehicleLayout = new GridItem(grid, 2, 4, 2, 4, vehicle, false);
        rotatedUpVehicleLayout = new GridItem(grid, 1, 1, 4, 4, up_vehicle, false);
    }
    else {
        dialPitchLayout = new GridItem(grid, -4, 4, 3, 3, dialPitch, false);
        // dialRollLayout = new GridItem(grid, -4, 1, 3, 3, dialRoll, false);
        dialYawLayout = new GridItem(grid, -4, 1, 3, 3, dialYaw);
        depthLayout = new GridItem(grid, -5, 1, 1, 3, depth);
        rotatedSideVehicleLayout = new GridItem(grid, -3, 4, 1, 3, vehicle, false);
        rotatedUpVehicleLayout = new GridItem(grid, -4, 1, 3, 3, up_vehicle, false);
    }

    gridItems.push(dialPitchLayout)
    gridItems.push(dialRollLayout)
    gridItems.push(dialYawLayout)
    gridItems.push(depthLayout)

    gridItems.push(rotatedSideVehicleLayout)
    gridItems.push(rotatedUpVehicleLayout)

    create_scale_for_dial("pitch", -180, 0)
    // create_scale_for_dial("roll", 0, -180)
    create_scale_for_dial("yaw", 0, 360)
    // set_text_info_value('depth-value', 100)
    
    function create_scale_for_dial(element_id, from_ang, to_ang) {
        const scale = document.getElementById(element_id);
        for (let angle = from_ang; angle < to_ang+1; angle += 15) {
            // Создаем метки (каждые 15°)
            const marker = document.createElement('div');
            marker.className = angle % 45 === 0 ? 'dial-marker dial-marker-45' : 'dial-marker dial-marker-15';
            marker.style.transform = `rotate(${180 + angle}deg)`;
            scale.appendChild(marker);
    }
}

})
