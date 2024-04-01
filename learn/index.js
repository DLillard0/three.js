import * as THREE from '../src/Three'

function main() {
  const canvas = document.getElementById('canvas')
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true
  })
  // 启用阴影属性
  renderer.shadowMap.enabled = true

  const fov = 75
  const aspect = 1
  const near = 0.1
  const far = 100
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far)
  camera.position.set(4, 2, 4)
  camera.lookAt(0, 0, 0)

  const scene = new THREE.Scene()

  const axes = new THREE.AxesHelper(8)
  scene.add(axes)

  const ambientLight = new THREE.AmbientLight(0xFFFFFF, 1)
  scene.add(ambientLight)

  {
    const color = 0xFFFFFF
    const intensity = 3
    const light = new THREE.DirectionalLight(color, intensity)
    // 设置投射阴影
    light.castShadow = true
    light.position.set(0, 6, -2)
    light.target.position.set(0, 0, 0)
    scene.add(light)
  }

  // {
  //   const color = 0xFFFFFF
  //   const intensity = 30
  //   const light = new THREE.PointLight(color, intensity)
  //   light.position.set(1.5, 0, -0.5)
  //   scene.add(light)
  // }

  {
    const geometry = new THREE.PlaneGeometry(8, 8)
    // basic 材质没办法投射阴影
    const material = new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    const plane = new THREE.Mesh(geometry, material)
    // 设置能被投射阴影
    plane.receiveShadow = true
    plane.rotateX(Math.PI / 2)
    plane.translateZ(2)
    scene.add(plane)
  }

  const boxWidth = 2
  const boxHeight = 2
  const boxDepth = 2
  const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth)

  function makeInstance(geometry, color, x) {
    const material = new THREE.MeshPhongMaterial({ color })
    const cube = new THREE.Mesh(geometry, material)
    // 设置能投射阴影
    cube.castShadow = true
    cube.receiveShadow = true
    cube.position.x = x
    scene.add(cube)
    return cube
  }

  const cubes = [
    makeInstance(geometry, 0xff0000, 0),
    // makeInstance(geometry, 0x8844aa, -2),
    // makeInstance(geometry, 0xaa8844, 2),
  ]

  function render(time) {
    if (resizeRendererToDisplaySize(renderer)) {
      const canvas = renderer.domElement
      camera.aspect = canvas.clientWidth / canvas.clientHeight
      camera.updateProjectionMatrix()
    }

    // cubes.forEach((cube, index) => {
    //   const rot = time * 0.001 * (1 + index * 0.1)
    //   cube.rotation.x = rot
    //   cube.rotation.y = rot
    // })
    renderer.render(scene, camera)
    // requestAnimationFrame(render)
  }

  function resizeRendererToDisplaySize(renderer) {
    const canvas = renderer.domElement
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const needResize = canvas.width !== width || canvas.height !== height
    if (needResize) {
      renderer.setSize(width, height, false)
    }
    return needResize
  }

  requestAnimationFrame(render)
}

main()
