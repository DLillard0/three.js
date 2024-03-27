import * as THREE from '../src/Three'

function main() {
  const canvas = document.getElementById('canvas')
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true
  })

  const fov = 75
  const aspect = 1
  const near = 0.1
  const far = 100
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far)
  camera.position.set(4, 2, 4)
  camera.lookAt(0, 0, 0)

  const scene = new THREE.Scene()

  const ambientLight = new THREE.AmbientLight(0xFFFFFF, 1)
  scene.add(ambientLight)

  {
    const color = 0xFFFFFF
    const intensity = 3
    const light = new THREE.DirectionalLight(color, intensity)
    light.position.set(-4, 2, 4)
    scene.add(light)
  }

  // {
  //   const color = 0xFFFF00
  //   const intensity = 3
  //   const light = new THREE.PointLight(color, intensity)
  //   light.position.set(1, 2, 4)
  //   scene.add(light)
  // }

  const boxWidth = 2
  const boxHeight = 2
  const boxDepth = 2
  const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth)

  function makeInstance(geometry, color, x) {
    const material = new THREE.MeshPhongMaterial({ color })
    const cube = new THREE.Mesh(geometry, material)
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
