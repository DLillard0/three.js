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
  const far = 5
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far)
  camera.position.z = 2

  const color = 0xFFFFFF
  const intensity = 3
  const light = new THREE.DirectionalLight(color, intensity)
  light.position.set(-1, 2, 4)

  const scene = new THREE.Scene()
  scene.add(light)

  const boxWidth = 1
  const boxHeight = 1
  const boxDepth = 1
  const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth)

  function makeInstance(geometry, color, x) {
    const material = new THREE.MeshPhongMaterial({ color })
    const cube = new THREE.Mesh(geometry, material)
    cube.position.x = x
    scene.add(cube)
    return cube
  }

  const cubes = [
    makeInstance(geometry, 0x44aa88, 0),
    makeInstance(geometry, 0x8844aa, -2),
    makeInstance(geometry, 0xaa8844, 2),
  ]

  function render(time) {
    if (resizeRendererToDisplaySize(renderer)) {
      const canvas = renderer.domElement
      camera.aspect = canvas.clientWidth / canvas.clientHeight
      camera.updateProjectionMatrix()
    }

    cubes.forEach((cube, index) => {
      const rot = time * 0.001 * (1 + index * 0.1)
      cube.rotation.x = rot
      cube.rotation.y = rot
    })
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
