import {
	REVISION,
	BackSide,
	FrontSide,
	DoubleSide,
	RGBAFormat,
	HalfFloatType,
	FloatType,
	UnsignedByteType,
	NoToneMapping,
	LinearMipmapLinearFilter,
	SRGBColorSpace,
	LinearSRGBColorSpace,
	sRGBEncoding,
	LinearEncoding,
	RGBAIntegerFormat,
	RGIntegerFormat,
	RedIntegerFormat,
	UnsignedIntType,
	UnsignedShortType,
	UnsignedInt248Type,
	UnsignedShort4444Type,
	UnsignedShort5551Type,
	WebGLCoordinateSystem,
	DisplayP3ColorSpace,
	LinearDisplayP3ColorSpace
} from '../constants.js';
import { Color } from '../math/Color.js';
import { Frustum } from '../math/Frustum.js';
import { Matrix4 } from '../math/Matrix4.js';
import { Vector2 } from '../math/Vector2.js';
import { Vector3 } from '../math/Vector3.js';
import { Vector4 } from '../math/Vector4.js';
import { floorPowerOfTwo } from '../math/MathUtils.js';
import { WebGLAnimation } from './webgl/WebGLAnimation.js';
import { WebGLAttributes } from './webgl/WebGLAttributes.js';
import { WebGLBackground } from './webgl/WebGLBackground.js';
import { WebGLBindingStates } from './webgl/WebGLBindingStates.js';
import { WebGLBufferRenderer } from './webgl/WebGLBufferRenderer.js';
import { WebGLCapabilities } from './webgl/WebGLCapabilities.js';
import { WebGLClipping } from './webgl/WebGLClipping.js';
import { WebGLCubeMaps } from './webgl/WebGLCubeMaps.js';
import { WebGLCubeUVMaps } from './webgl/WebGLCubeUVMaps.js';
import { WebGLExtensions } from './webgl/WebGLExtensions.js';
import { WebGLGeometries } from './webgl/WebGLGeometries.js';
import { WebGLIndexedBufferRenderer } from './webgl/WebGLIndexedBufferRenderer.js';
import { WebGLInfo } from './webgl/WebGLInfo.js';
import { WebGLMorphtargets } from './webgl/WebGLMorphtargets.js';
import { WebGLObjects } from './webgl/WebGLObjects.js';
import { WebGLPrograms } from './webgl/WebGLPrograms.js';
import { WebGLProperties } from './webgl/WebGLProperties.js';
import { WebGLRenderLists } from './webgl/WebGLRenderLists.js';
import { WebGLRenderStates } from './webgl/WebGLRenderStates.js';
import { WebGLRenderTarget } from './WebGLRenderTarget.js';
import { WebGLShadowMap } from './webgl/WebGLShadowMap.js';
import { WebGLState } from './webgl/WebGLState.js';
import { WebGLTextures } from './webgl/WebGLTextures.js';
import { WebGLUniforms } from './webgl/WebGLUniforms.js';
import { WebGLUtils } from './webgl/WebGLUtils.js';
import { WebXRManager } from './webxr/WebXRManager.js';
import { WebGLMaterials } from './webgl/WebGLMaterials.js';
import { WebGLUniformsGroups } from './webgl/WebGLUniformsGroups.js';
import { createCanvasElement } from '../utils.js';
import { ColorManagement } from '../math/ColorManagement.js';

class WebGLRenderer {

	constructor( parameters = {} ) {

		const {
			canvas = createCanvasElement(),
			context = null,
			depth = true,
			stencil = true,
			alpha = false,
			antialias = false,
			premultipliedAlpha = true,
			preserveDrawingBuffer = false,
			powerPreference = 'default',
			failIfMajorPerformanceCaveat = false,
		} = parameters;

		this.isWebGLRenderer = true;

		let _alpha;

		if ( context !== null ) {

			_alpha = context.getContextAttributes().alpha;

		} else {

			_alpha = alpha;

		}

		const uintClearColor = new Uint32Array( 4 );
		const intClearColor = new Int32Array( 4 );

    // 当前执行渲染时的 renderList 对象，储存 透明物体、透射物体、不透明物体 列表
		let currentRenderList = null;
    // 当前执行渲染时的 renderState 对象，储存 光照和阴影 信息
		let currentRenderState = null;

		// render() can be called from within a callback triggered by another render.
		// We track this so that the nested render call gets its list and state isolated from the parent render call.

    // 这里的两个 stack 是为了做嵌套渲染时的 renderList 和 renderState 保存和隔离
		const renderListStack = [];
		const renderStateStack = [];

		// public properties

		this.domElement = canvas;

		// Debug configuration container
		this.debug = {

			/**
			 * Enables error checking and reporting when shader programs are being compiled
			 * @type {boolean}
			 */
			checkShaderErrors: true,
			/**
			 * Callback for custom error reporting.
			 * @type {?Function}
			 */
			onShaderError: null
		};

		// clearing

		this.autoClear = true;
		this.autoClearColor = true;
		this.autoClearDepth = true;
		this.autoClearStencil = true;

		// scene graph

    // 定义渲染器是否应对对象进行排序。默认是true.
    // 说明: 排序用于尝试正确渲染出具有一定透明度的对象。根据定义，排序可能不总是有用。
    // 根据应用的需求，可能需要关闭排序并使其他方法来处理透明度的渲染，例如，手动确定每个对象的渲染顺序。
		this.sortObjects = true;

		// user-defined clipping

		this.clippingPlanes = [];
    // 定义渲染器是否考虑对象级剪切平面。
		this.localClippingEnabled = false;

		// physically based shading

		this._outputColorSpace = SRGBColorSpace;

		// physical lights

		this._useLegacyLights = false;

		// tone mapping

		this.toneMapping = NoToneMapping;
		this.toneMappingExposure = 1.0;

		// internal properties

		const _this = this;

    // 是否丢失 canvas 的 webgl 上下文标志位
		let _isContextLost = false;

		// internal state cache

		let _currentActiveCubeFace = 0;
		let _currentActiveMipmapLevel = 0;
		let _currentRenderTarget = null;
		let _currentMaterialId = - 1;

		let _currentCamera = null;

		const _currentViewport = new Vector4();
		const _currentScissor = new Vector4();
		let _currentScissorTest = null;

		const _currentClearColor = new Color( 0x000000 );
		let _currentClearAlpha = 0;

		//

		let _width = canvas.width;
		let _height = canvas.height;

		let _pixelRatio = 1;
		let _opaqueSort = null;
		let _transparentSort = null;

		const _viewport = new Vector4( 0, 0, _width, _height );
		const _scissor = new Vector4( 0, 0, _width, _height );
		let _scissorTest = false;

		// frustum

    // 视锥体
    // 用于确定相机视野内的东西。 它有助于加速渲染过程——位于摄像机视锥体外的物体可以安全地排除在渲染之外。
		const _frustum = new Frustum();

		// clipping

		let _clippingEnabled = false;
		let _localClippingEnabled = false;

		// transmission

		let _transmissionRenderTarget = null;

		// camera matrices cache

		const _projScreenMatrix = new Matrix4();

		const _vector2 = new Vector2();
		const _vector3 = new Vector3();

		const _emptyScene = { background: null, fog: null, environment: null, overrideMaterial: null, isScene: true };

		function getTargetPixelRatio() {

			return _currentRenderTarget === null ? _pixelRatio : 1;

		}

		// initialize

		let _gl = context;

    // 获取支持的 webgl 上下文
		function getContext( contextNames, contextAttributes ) {

			for ( let i = 0; i < contextNames.length; i ++ ) {

				const contextName = contextNames[ i ];
				const context = canvas.getContext( contextName, contextAttributes );
				if ( context !== null ) return context;

			}

			return null;

		}

		try {

			const contextAttributes = {
				alpha: true,
				depth,
				stencil,
				antialias,
				premultipliedAlpha,
				preserveDrawingBuffer,
				powerPreference,
				failIfMajorPerformanceCaveat,
			};

			// OffscreenCanvas does not have setAttribute, see #22811
			if ( 'setAttribute' in canvas ) canvas.setAttribute( 'data-engine', `three.js r${REVISION}` );

			// event listeners must be registered before WebGL context is created, see #12753
			canvas.addEventListener( 'webglcontextlost', onContextLost, false );
			canvas.addEventListener( 'webglcontextrestored', onContextRestore, false );
			canvas.addEventListener( 'webglcontextcreationerror', onContextCreationError, false );

			if ( _gl === null ) {

				const contextNames = [ 'webgl2', 'webgl', 'experimental-webgl' ];

				if ( _this.isWebGL1Renderer === true ) {

					contextNames.shift();

				}

				_gl = getContext( contextNames, contextAttributes );

				if ( _gl === null ) {

					if ( getContext( contextNames ) ) {

						throw new Error( 'Error creating WebGL context with your selected attributes.' );

					} else {

						throw new Error( 'Error creating WebGL context.' );

					}

				}

			}

			if ( typeof WebGLRenderingContext !== 'undefined' && _gl instanceof WebGLRenderingContext ) { // @deprecated, r153

				console.warn( 'THREE.WebGLRenderer: WebGL 1 support was deprecated in r153 and will be removed in r163.' );

			}

			// Some experimental-webgl implementations do not have getShaderPrecisionFormat

			if ( _gl.getShaderPrecisionFormat === undefined ) {

				_gl.getShaderPrecisionFormat = function () {

					return { 'rangeMin': 1, 'rangeMax': 1, 'precision': 1 };

				};

			}

		} catch ( error ) {

			console.error( 'THREE.WebGLRenderer: ' + error.message );
			throw error;

		}

		let extensions, capabilities, state, info;
		let properties, textures, cubemaps, cubeuvmaps, attributes, geometries, objects;
		let programCache, materials, renderLists, renderStates, clipping, shadowMap;

		let background, morphtargets, bufferRenderer, indexedBufferRenderer;

		let utils, bindingStates, uniformsGroups;

    // 初始化一些字典对象
		function initGLContext() {

			extensions = new WebGLExtensions( _gl );

			capabilities = new WebGLCapabilities( _gl, extensions, parameters );

			extensions.init( capabilities );

			utils = new WebGLUtils( _gl, extensions, capabilities );

			state = new WebGLState( _gl, extensions, capabilities );

			info = new WebGLInfo( _gl );
			properties = new WebGLProperties();
			textures = new WebGLTextures( _gl, extensions, state, properties, capabilities, utils, info );
			cubemaps = new WebGLCubeMaps( _this );
			cubeuvmaps = new WebGLCubeUVMaps( _this );
			attributes = new WebGLAttributes( _gl, capabilities );
			bindingStates = new WebGLBindingStates( _gl, extensions, attributes, capabilities );
			geometries = new WebGLGeometries( _gl, attributes, info, bindingStates );
			objects = new WebGLObjects( _gl, geometries, attributes, info );
			morphtargets = new WebGLMorphtargets( _gl, capabilities, textures );
			clipping = new WebGLClipping( properties );
			programCache = new WebGLPrograms( _this, cubemaps, cubeuvmaps, extensions, capabilities, bindingStates, clipping );
			materials = new WebGLMaterials( _this, properties );
			renderLists = new WebGLRenderLists();
			renderStates = new WebGLRenderStates( extensions, capabilities );
			background = new WebGLBackground( _this, cubemaps, cubeuvmaps, state, objects, _alpha, premultipliedAlpha );
			shadowMap = new WebGLShadowMap( _this, objects, capabilities );
			uniformsGroups = new WebGLUniformsGroups( _gl, info, capabilities, state );

			bufferRenderer = new WebGLBufferRenderer( _gl, extensions, info, capabilities );
			indexedBufferRenderer = new WebGLIndexedBufferRenderer( _gl, extensions, info, capabilities );

			info.programs = programCache.programs;

			_this.capabilities = capabilities;
			_this.extensions = extensions;
			_this.properties = properties;
			_this.renderLists = renderLists;
			_this.shadowMap = shadowMap;
			_this.state = state;
			_this.info = info;

		}

		initGLContext();

		// xr

		const xr = new WebXRManager( _this, _gl );

		this.xr = xr;

		// API

		this.getContext = function () {

			return _gl;

		};

		this.getContextAttributes = function () {

			return _gl.getContextAttributes();

		};

		this.forceContextLoss = function () {

			const extension = extensions.get( 'WEBGL_lose_context' );
			if ( extension ) extension.loseContext();

		};

		this.forceContextRestore = function () {

			const extension = extensions.get( 'WEBGL_lose_context' );
			if ( extension ) extension.restoreContext();

		};

		this.getPixelRatio = function () {

			return _pixelRatio;

		};

		this.setPixelRatio = function ( value ) {

			if ( value === undefined ) return;

			_pixelRatio = value;

			this.setSize( _width, _height, false );

		};

		this.getSize = function ( target ) {

			return target.set( _width, _height );

		};

		this.setSize = function ( width, height, updateStyle = true ) {

			if ( xr.isPresenting ) {

				console.warn( 'THREE.WebGLRenderer: Can\'t change size while VR device is presenting.' );
				return;

			}

			_width = width;
			_height = height;

			canvas.width = Math.floor( width * _pixelRatio );
			canvas.height = Math.floor( height * _pixelRatio );

			if ( updateStyle === true ) {

				canvas.style.width = width + 'px';
				canvas.style.height = height + 'px';

			}

			this.setViewport( 0, 0, width, height );

		};

		this.getDrawingBufferSize = function ( target ) {

			return target.set( _width * _pixelRatio, _height * _pixelRatio ).floor();

		};

		this.setDrawingBufferSize = function ( width, height, pixelRatio ) {

			_width = width;
			_height = height;

			_pixelRatio = pixelRatio;

			canvas.width = Math.floor( width * pixelRatio );
			canvas.height = Math.floor( height * pixelRatio );

			this.setViewport( 0, 0, width, height );

		};

		this.getCurrentViewport = function ( target ) {

			return target.copy( _currentViewport );

		};

		this.getViewport = function ( target ) {

			return target.copy( _viewport );

		};

		this.setViewport = function ( x, y, width, height ) {

			if ( x.isVector4 ) {

				_viewport.set( x.x, x.y, x.z, x.w );

			} else {

				_viewport.set( x, y, width, height );

			}

			state.viewport( _currentViewport.copy( _viewport ).multiplyScalar( _pixelRatio ).floor() );

		};

		this.getScissor = function ( target ) {

			return target.copy( _scissor );

		};

		this.setScissor = function ( x, y, width, height ) {

			if ( x.isVector4 ) {

				_scissor.set( x.x, x.y, x.z, x.w );

			} else {

				_scissor.set( x, y, width, height );

			}

			state.scissor( _currentScissor.copy( _scissor ).multiplyScalar( _pixelRatio ).floor() );

		};

		this.getScissorTest = function () {

			return _scissorTest;

		};

		this.setScissorTest = function ( boolean ) {

			state.setScissorTest( _scissorTest = boolean );

		};

		this.setOpaqueSort = function ( method ) {

			_opaqueSort = method;

		};

		this.setTransparentSort = function ( method ) {

			_transparentSort = method;

		};

		// Clearing

		this.getClearColor = function ( target ) {

			return target.copy( background.getClearColor() );

		};

		this.setClearColor = function () {

			background.setClearColor.apply( background, arguments );

		};

		this.getClearAlpha = function () {

			return background.getClearAlpha();

		};

		this.setClearAlpha = function () {

			background.setClearAlpha.apply( background, arguments );

		};

		this.clear = function ( color = true, depth = true, stencil = true ) {

			let bits = 0;

			if ( color ) {

				// check if we're trying to clear an integer target
				let isIntegerFormat = false;
				if ( _currentRenderTarget !== null ) {

					const targetFormat = _currentRenderTarget.texture.format;
					isIntegerFormat = targetFormat === RGBAIntegerFormat ||
						targetFormat === RGIntegerFormat ||
						targetFormat === RedIntegerFormat;

				}

				// use the appropriate clear functions to clear the target if it's a signed
				// or unsigned integer target
				if ( isIntegerFormat ) {

					const targetType = _currentRenderTarget.texture.type;
					const isUnsignedType = targetType === UnsignedByteType ||
						targetType === UnsignedIntType ||
						targetType === UnsignedShortType ||
						targetType === UnsignedInt248Type ||
						targetType === UnsignedShort4444Type ||
						targetType === UnsignedShort5551Type;

					const clearColor = background.getClearColor();
					const a = background.getClearAlpha();
					const r = clearColor.r;
					const g = clearColor.g;
					const b = clearColor.b;

					if ( isUnsignedType ) {

						uintClearColor[ 0 ] = r;
						uintClearColor[ 1 ] = g;
						uintClearColor[ 2 ] = b;
						uintClearColor[ 3 ] = a;
						_gl.clearBufferuiv( _gl.COLOR, 0, uintClearColor );

					} else {

						intClearColor[ 0 ] = r;
						intClearColor[ 1 ] = g;
						intClearColor[ 2 ] = b;
						intClearColor[ 3 ] = a;
						_gl.clearBufferiv( _gl.COLOR, 0, intClearColor );

					}

				} else {

					bits |= _gl.COLOR_BUFFER_BIT;

				}

			}

			if ( depth ) bits |= _gl.DEPTH_BUFFER_BIT;
			if ( stencil ) {

				bits |= _gl.STENCIL_BUFFER_BIT;
				this.state.buffers.stencil.setMask( 0xffffffff );

			}

			_gl.clear( bits );

		};

		this.clearColor = function () {

			this.clear( true, false, false );

		};

		this.clearDepth = function () {

			this.clear( false, true, false );

		};

		this.clearStencil = function () {

			this.clear( false, false, true );

		};

		//

		this.dispose = function () {

			canvas.removeEventListener( 'webglcontextlost', onContextLost, false );
			canvas.removeEventListener( 'webglcontextrestored', onContextRestore, false );
			canvas.removeEventListener( 'webglcontextcreationerror', onContextCreationError, false );

			renderLists.dispose();
			renderStates.dispose();
			properties.dispose();
			cubemaps.dispose();
			cubeuvmaps.dispose();
			objects.dispose();
			bindingStates.dispose();
			uniformsGroups.dispose();
			programCache.dispose();

			xr.dispose();

			xr.removeEventListener( 'sessionstart', onXRSessionStart );
			xr.removeEventListener( 'sessionend', onXRSessionEnd );

			if ( _transmissionRenderTarget ) {

				_transmissionRenderTarget.dispose();
				_transmissionRenderTarget = null;

			}

			animation.stop();

		};

		// Events

		function onContextLost( event ) {

			event.preventDefault();

			console.log( 'THREE.WebGLRenderer: Context Lost.' );

			_isContextLost = true;

		}

		function onContextRestore( /* event */ ) {

			console.log( 'THREE.WebGLRenderer: Context Restored.' );

			_isContextLost = false;

			const infoAutoReset = info.autoReset;
			const shadowMapEnabled = shadowMap.enabled;
			const shadowMapAutoUpdate = shadowMap.autoUpdate;
			const shadowMapNeedsUpdate = shadowMap.needsUpdate;
			const shadowMapType = shadowMap.type;

			initGLContext();

			info.autoReset = infoAutoReset;
			shadowMap.enabled = shadowMapEnabled;
			shadowMap.autoUpdate = shadowMapAutoUpdate;
			shadowMap.needsUpdate = shadowMapNeedsUpdate;
			shadowMap.type = shadowMapType;

		}

		function onContextCreationError( event ) {

			console.error( 'THREE.WebGLRenderer: A WebGL context could not be created. Reason: ', event.statusMessage );

		}

		function onMaterialDispose( event ) {

			const material = event.target;

			material.removeEventListener( 'dispose', onMaterialDispose );

			deallocateMaterial( material );

		}

		// Buffer deallocation

		function deallocateMaterial( material ) {

			releaseMaterialProgramReferences( material );

			properties.remove( material );

		}


		function releaseMaterialProgramReferences( material ) {

			const programs = properties.get( material ).programs;

			if ( programs !== undefined ) {

				programs.forEach( function ( program ) {

					programCache.releaseProgram( program );

				} );

				if ( material.isShaderMaterial ) {

					programCache.releaseShaderCache( material );

				}

			}

		}

		// Buffer rendering
    // 直接渲染缓冲区
		this.renderBufferDirect = function ( camera, scene, geometry, material, object, group ) {

      // 渲染雾的时候可能 scene 为 null，此时设置为 _emptyScene
			if ( scene === null ) scene = _emptyScene; // renderBufferDirect second parameter used to be fog (could be null)

      // 判断正面的顺时针？
			const frontFaceCW = ( object.isMesh && object.matrixWorld.determinant() < 0 );

      // 设置了一些全局 uniform 变量？
			const program = setProgram( camera, scene, geometry, material, object );

			state.setMaterial( material, frontFaceCW );

			//

			let index = geometry.index;
      // 范围系数
			let rangeFactor = 1;

      // 是否渲染线框
			if ( material.wireframe === true ) {

				index = geometries.getWireframeAttribute( geometry );

				if ( index === undefined ) return;

        // 要渲染线框范围系数调整为 2
				rangeFactor = 2;

			}

			const drawRange = geometry.drawRange;
			const position = geometry.attributes.position;

			let drawStart = drawRange.start * rangeFactor;
			let drawEnd = ( drawRange.start + drawRange.count ) * rangeFactor;

			if ( group !== null ) {

				drawStart = Math.max( drawStart, group.start * rangeFactor );
				drawEnd = Math.min( drawEnd, ( group.start + group.count ) * rangeFactor );

			}

			if ( index !== null ) {

				drawStart = Math.max( drawStart, 0 );
				drawEnd = Math.min( drawEnd, index.count );

			} else if ( position !== undefined && position !== null ) {

				drawStart = Math.max( drawStart, 0 );
				drawEnd = Math.min( drawEnd, position.count );

			}

			const drawCount = drawEnd - drawStart;

			if ( drawCount < 0 || drawCount === Infinity ) return;

			//

			bindingStates.setup( object, material, program, geometry, index );

			let attribute;
			let renderer = bufferRenderer;

			if ( index !== null ) {

				attribute = attributes.get( index );

				renderer = indexedBufferRenderer;
				renderer.setIndex( attribute );

			}

			//

			if ( object.isMesh ) {

				if ( material.wireframe === true ) {

          // 线框模式
					state.setLineWidth( material.wireframeLinewidth * getTargetPixelRatio() );
					renderer.setMode( _gl.LINES );

				} else {

					renderer.setMode( _gl.TRIANGLES );

				}

			} else if ( object.isLine ) {

				let lineWidth = material.linewidth;

				if ( lineWidth === undefined ) lineWidth = 1; // Not using Line*Material

				state.setLineWidth( lineWidth * getTargetPixelRatio() );

				if ( object.isLineSegments ) {

					renderer.setMode( _gl.LINES );

				} else if ( object.isLineLoop ) {

					renderer.setMode( _gl.LINE_LOOP );

				} else {

					renderer.setMode( _gl.LINE_STRIP );

				}

			} else if ( object.isPoints ) {

				renderer.setMode( _gl.POINTS );

			} else if ( object.isSprite ) {

				renderer.setMode( _gl.TRIANGLES );

			}

			if ( object.isBatchedMesh ) {

        // 是否是批处理网格
				renderer.renderMultiDraw( object._multiDrawStarts, object._multiDrawCounts, object._multiDrawCount );

			} else if ( object.isInstancedMesh ) {

        // 是否是实例化网格
				renderer.renderInstances( drawStart, drawCount, object.count );

			} else if ( geometry.isInstancedBufferGeometry ) {

				const maxInstanceCount = geometry._maxInstanceCount !== undefined ? geometry._maxInstanceCount : Infinity;
				const instanceCount = Math.min( geometry.instanceCount, maxInstanceCount );

				renderer.renderInstances( drawStart, drawCount, instanceCount );

			} else {

        // 调用 webgl 原生 draw API 进行绘制
				renderer.render( drawStart, drawCount );

			}

		};

		// Compile

		function prepareMaterial( material, scene, object ) {

			if ( material.transparent === true && material.side === DoubleSide && material.forceSinglePass === false ) {

				material.side = BackSide;
				material.needsUpdate = true;
				getProgram( material, scene, object );

				material.side = FrontSide;
				material.needsUpdate = true;
				getProgram( material, scene, object );

				material.side = DoubleSide;

			} else {

				getProgram( material, scene, object );

			}

		}

		this.compile = function ( scene, camera, targetScene = null ) {

			if ( targetScene === null ) targetScene = scene;

			currentRenderState = renderStates.get( targetScene );
			currentRenderState.init();

			renderStateStack.push( currentRenderState );

			// gather lights from both the target scene and the new object that will be added to the scene.

			targetScene.traverseVisible( function ( object ) {

				if ( object.isLight && object.layers.test( camera.layers ) ) {

					currentRenderState.pushLight( object );

					if ( object.castShadow ) {

						currentRenderState.pushShadow( object );

					}

				}

			} );

			if ( scene !== targetScene ) {

				scene.traverseVisible( function ( object ) {

					if ( object.isLight && object.layers.test( camera.layers ) ) {

						currentRenderState.pushLight( object );

						if ( object.castShadow ) {

							currentRenderState.pushShadow( object );

						}

					}

				} );

			}

			currentRenderState.setupLights( _this._useLegacyLights );

			// Only initialize materials in the new scene, not the targetScene.

			const materials = new Set();

			scene.traverse( function ( object ) {

				const material = object.material;

				if ( material ) {

					if ( Array.isArray( material ) ) {

						for ( let i = 0; i < material.length; i ++ ) {

							const material2 = material[ i ];

							prepareMaterial( material2, targetScene, object );
							materials.add( material2 );

						}

					} else {

						prepareMaterial( material, targetScene, object );
						materials.add( material );

					}

				}

			} );

			renderStateStack.pop();
			currentRenderState = null;

			return materials;

		};

		// compileAsync

		this.compileAsync = function ( scene, camera, targetScene = null ) {

			const materials = this.compile( scene, camera, targetScene );

			// Wait for all the materials in the new object to indicate that they're
			// ready to be used before resolving the promise.

			return new Promise( ( resolve ) => {

				function checkMaterialsReady() {

					materials.forEach( function ( material ) {

						const materialProperties = properties.get( material );
						const program = materialProperties.currentProgram;

						if ( program.isReady() ) {

							// remove any programs that report they're ready to use from the list
							materials.delete( material );

						}

					} );

					// once the list of compiling materials is empty, call the callback

					if ( materials.size === 0 ) {

						resolve( scene );
						return;

					}

					// if some materials are still not ready, wait a bit and check again

					setTimeout( checkMaterialsReady, 10 );

				}

				if ( extensions.get( 'KHR_parallel_shader_compile' ) !== null ) {

					// If we can check the compilation status of the materials without
					// blocking then do so right away.

					checkMaterialsReady();

				} else {

					// Otherwise start by waiting a bit to give the materials we just
					// initialized a chance to finish.

					setTimeout( checkMaterialsReady, 10 );

				}

			} );

		};

		// Animation Loop

		let onAnimationFrameCallback = null;

		function onAnimationFrame( time ) {

			if ( onAnimationFrameCallback ) onAnimationFrameCallback( time );

		}

		function onXRSessionStart() {

			animation.stop();

		}

		function onXRSessionEnd() {

			animation.start();

		}

		const animation = new WebGLAnimation();
		animation.setAnimationLoop( onAnimationFrame );

		if ( typeof self !== 'undefined' ) animation.setContext( self );

		this.setAnimationLoop = function ( callback ) {

			onAnimationFrameCallback = callback;
			xr.setAnimationLoop( callback );

			( callback === null ) ? animation.stop() : animation.start();

		};

		xr.addEventListener( 'sessionstart', onXRSessionStart );
		xr.addEventListener( 'sessionend', onXRSessionEnd );

		// Rendering

		this.render = function ( scene, camera ) {

			if ( camera !== undefined && camera.isCamera !== true ) {

				console.error( 'THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.' );
				return;

			}

			if ( _isContextLost === true ) return;

			// update scene graph

      // 从场景图根节点开始往下更新节点的世界矩阵和本地矩阵
			if ( scene.matrixWorldAutoUpdate === true ) scene.updateMatrixWorld();

			// update camera matrices and frustum

      // 相机不一定要添加到场景树中，如果添加了则不用更新，如果没添加这一步会更新世界矩阵和本地矩阵
			if ( camera.parent === null && camera.matrixWorldAutoUpdate === true ) camera.updateMatrixWorld();

      // 扩展现实 XR 相关
			if ( xr.enabled === true && xr.isPresenting === true ) {

				if ( xr.cameraAutoUpdate === true ) xr.updateCamera( camera );

				camera = xr.getCamera(); // use XR camera for rendering

			}

			// 调用 scene 的 onBeforeRender 回调函数
			if ( scene.isScene === true ) scene.onBeforeRender( _this, scene, camera, _currentRenderTarget );

      // 根据 scene 和嵌套渲染深度获取 renderState 对象
			currentRenderState = renderStates.get( scene, renderStateStack.length );
      // 初始化 renderState
			currentRenderState.init();

      // 添加到 renderStateStack 中，这样当嵌套着再次调用 render 时就会重新创建 renderState，并且原来的也会被保留
			renderStateStack.push( currentRenderState );

      // matrixWorldInverse 为相机的世界变换矩阵的逆矩阵，也就是 viewMatrix 视图矩阵
      // projectionMatrix 为投影矩阵
      // _projScreenMatrix 提前计算世界坐标投影到标准立方体的矩阵：投影视图矩阵
			_projScreenMatrix.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
      // 根据投影视图矩阵 _projScreenMatrix 来设置当前视椎体的六个面。
			_frustum.setFromProjectionMatrix( _projScreenMatrix );

      // 剪切平面相关
			_localClippingEnabled = this.localClippingEnabled;
			_clippingEnabled = clipping.init( this.clippingPlanes, _localClippingEnabled );

      // 根据 scene 和嵌套渲染深度获取 renderList 对象
			currentRenderList = renderLists.get( scene, renderListStack.length );
      // 初始化 renderList
			currentRenderList.init();

      // 添加到 renderListStack 中
			renderListStack.push( currentRenderList );

      // 从场景树根节点开始预处理所有节点
			projectObject( scene, camera, 0, _this.sortObjects );

      // 清理未激活对象
			currentRenderList.finish();

			if ( _this.sortObjects === true ) {

        // 需要排序，对渲染对象进行排序
				currentRenderList.sort( _opaqueSort, _transparentSort );

			}

			// 准备工作结束
      // render.frame + 1
			this.info.render.frame ++;

      // 待解读：阴影渲染
			if ( _clippingEnabled === true ) clipping.beginShadows();

			const shadowsArray = currentRenderState.state.shadowsArray;

			shadowMap.render( shadowsArray, scene, camera );

			if ( _clippingEnabled === true ) clipping.endShadows();


			if ( this.info.autoReset === true ) this.info.reset();


      // 待解读：背景渲染
			if ( xr.enabled === false || xr.isPresenting === false || xr.hasDepthSensing() === false ) {

				background.render( currentRenderList, scene );

			}

			// render scene
      // 开始渲染场景树

      // 安装光源信息
			currentRenderState.setupLights( _this._useLegacyLights );

			if ( camera.isArrayCamera ) {

        // 如果是摄像机阵列，遍历对每个相机运行 renderScene
				const cameras = camera.cameras;

				for ( let i = 0, l = cameras.length; i < l; i ++ ) {

					const camera2 = cameras[ i ];

					renderScene( currentRenderList, scene, camera2, camera2.viewport );

				}

			} else {

        // 对相机运行 renderScene
				renderScene( currentRenderList, scene, camera );

			}

			if ( _currentRenderTarget !== null ) {

				// resolve multisample renderbuffers to a single-sample texture if necessary

				textures.updateMultisampleRenderTarget( _currentRenderTarget );

				// Generate mipmap if we're using any kind of mipmap filtering

				textures.updateRenderTargetMipmap( _currentRenderTarget );

			}

      // 运行 scene 的 onAfterRender 注册回调
			if ( scene.isScene === true ) scene.onAfterRender( _this, scene, camera );

			// _gl.finish();

      // 清理本次渲染的一些绑定状态
			bindingStates.resetDefaultState();
			_currentMaterialId = - 1;
			_currentCamera = null;

      // 从 renderStateStack 弹出当前的 renderState
			renderStateStack.pop();

			if ( renderStateStack.length > 0 ) {

        // 如果栈内还有 renderState，将 currentRenderState 置为最后一个
				currentRenderState = renderStateStack[ renderStateStack.length - 1 ];

			} else {

				currentRenderState = null;

			}

      // 从 renderListStack 弹出当前的 renderList
			renderListStack.pop();

			if ( renderListStack.length > 0 ) {

        // 如果栈内还有 renderList，将 currentRenderList 置为最后一个
				currentRenderList = renderListStack[ renderListStack.length - 1 ];

			} else {

				currentRenderList = null;

			}

		};

    // 递归预处理对象
		function projectObject( object, camera, groupOrder, sortObjects ) {

      // 如果当前对象不可见，那么不处理当前对象以及它的所有子节点对象
			if ( object.visible === false ) return;

      // 测试物体的层级是否和当前相机的层级相与大于 0，只有至少与激活相机的一个层级相同才能可见
      // 就算与相机不在同层级也不影响处理子节点，这是 layer 与 visible 属性的区别
			const visible = object.layers.test( camera.layers );

      // 如果物体可见，根据物体类型分别做处理
			if ( visible ) {

        if ( object.isGroup ) {

          // 物体属于 Group
          // 设置一下 groupOrder 为当前 group 的 renderOrder，影响子节点对象
					groupOrder = object.renderOrder;

				} else if ( object.isLOD ) {

          // 物体属于 LOD，多细节层次对象，每个层级关联一个集合体
          // update 是基于每个level中的 object 和 camera（摄像机）之间的距离，来设置其可见性
					if ( object.autoUpdate === true ) object.update( camera );

				} else if ( object.isLight ) {

          // 物体属于光源
          // 在 renderState 的 lightsArray 中添加
					currentRenderState.pushLight( object );

					if ( object.castShadow ) {

            // 如果光源开启 castShadow
            // 在 renderState 的 shadowsArray 中添加
						currentRenderState.pushShadow( object );

					}

				} else if ( object.isSprite ) {

          // 当前物体是一个 Sprite 精灵
          // 如果 frustumCulled 为 false 则不检查视锥可见性直接继续处理，
          // 如果为 true 检查精灵sprite是否与截锥体相交，不相交不处理
					if ( ! object.frustumCulled || _frustum.intersectsSprite( object ) ) {

						if ( sortObjects ) {

              // 如果需要排序物体，计算物体坐标左乘 MVP 矩阵保存到 _vector3 临时变量中
              // 等于求本地（0，0，0）坐标到投影空间的坐标
							_vector3.setFromMatrixPosition( object.matrixWorld )
								.applyMatrix4( _projScreenMatrix );

						}

            // 获取物体的 buffergeometry
						const geometry = objects.update( object );
						const material = object.material;

            // 如果物体的材质可见，那么添加到 renderList 中
						if ( material.visible ) {

              // 这里 _vector3.z 就是传入了深度信息，记录在 renderItem 上，用于渲染排序
							currentRenderList.push( object, geometry, material, groupOrder, _vector3.z, null );

						}

					}

				} else if ( object.isMesh || object.isLine || object.isPoints ) {

          // 当前物体是一个网格、线或者点
          // 根据 frustumCulled 看是否需要做视锥可见性检查
					if ( ! object.frustumCulled || _frustum.intersectsObject( object ) ) {

            // 获取物体的 buffergeometry
						const geometry = objects.update( object );
						const material = object.material;

						if ( sortObjects ) {

              // 需要排序物体渲染顺序
              // 如果物体的 boundingSphere 包围球不等于 undefined，说明有这个属性
							if ( object.boundingSphere !== undefined ) {

                // 如果为 null 则重新生成包围球
								if ( object.boundingSphere === null ) object.computeBoundingSphere();
                // 将包围球的中心作为 _vector3 的值
								_vector3.copy( object.boundingSphere.center );

							} else {

                // 包围球不在 object 上那么就是几何 geometry 上
								if ( geometry.boundingSphere === null ) geometry.computeBoundingSphere();
								_vector3.copy( geometry.boundingSphere.center );

							}

              // 将 _vector3 储存为投影空间的坐标
              // 等于求包围球中心坐标到投影空间的坐标
							_vector3
								.applyMatrix4( object.matrixWorld )
								.applyMatrix4( _projScreenMatrix );

						}

						if ( Array.isArray( material ) ) {

              // geometry.groups 决定着将当前几何体分割成组进行渲染，每个部分都会在单独的 WebGL 的 draw call 中进行绘制。
              // 该方法可以让当前的 bufferGeometry 可以使用一个材质队列进行描述。
							const groups = geometry.groups;

							for ( let i = 0, l = groups.length; i < l; i ++ ) {

								const group = groups[ i ];
								const groupMaterial = material[ group.materialIndex ];

								if ( groupMaterial && groupMaterial.visible ) {

                  // 判断材质可见性决定是否添加到 renderList
									currentRenderList.push( object, geometry, groupMaterial, groupOrder, _vector3.z, group );

								}

							}

						} else if ( material.visible ) {

              // 单个材质，直接判断可见性决定是否添加到 renderList
							currentRenderList.push( object, geometry, material, groupOrder, _vector3.z, null );

						}

					}

				}

			}

			const children = object.children;

      // 递归处理子节点对象
			for ( let i = 0, l = children.length; i < l; i ++ ) {

				projectObject( children[ i ], camera, groupOrder, sortObjects );

			}

		}

    // 渲染场景树
		function renderScene( currentRenderList, scene, camera, viewport ) {

      // 获取三种物体列表
			const opaqueObjects = currentRenderList.opaque;
			const transmissiveObjects = currentRenderList.transmissive;
			const transparentObjects = currentRenderList.transparent;

      // 根据相机安装光源信息
			currentRenderState.setupLightsView( camera );

      // 设置裁剪平面信息
			if ( _clippingEnabled === true ) clipping.setGlobalState( _this.clippingPlanes, camera );

      // 先渲染透射物体？
			if ( transmissiveObjects.length > 0 ) renderTransmissionPass( opaqueObjects, transmissiveObjects, scene, camera );

      // 设置 viewport 信息
			if ( viewport ) state.viewport( _currentViewport.copy( viewport ) );

      // 调用 renderObjects 去渲染三个物体列表
      // 先渲染不透明物体
			if ( opaqueObjects.length > 0 ) renderObjects( opaqueObjects, scene, camera );
      // 再透射物体
			if ( transmissiveObjects.length > 0 ) renderObjects( transmissiveObjects, scene, camera );
      // 最后是透明物体
			if ( transparentObjects.length > 0 ) renderObjects( transparentObjects, scene, camera );

			// Ensure depth buffer writing is enabled so it can be cleared on next render
      // 确保启用深度缓冲区写入，以便在下次渲染时将其清除
			state.buffers.depth.setTest( true );
			state.buffers.depth.setMask( true );
			state.buffers.color.setMask( true );

      // 作用？
			state.setPolygonOffset( false );

		}

		function renderTransmissionPass( opaqueObjects, transmissiveObjects, scene, camera ) {

			const overrideMaterial = scene.isScene === true ? scene.overrideMaterial : null;

      // 如果 scene 有强制指定的材质去渲染，直接跳过本流程
			if ( overrideMaterial !== null ) {

				return;

			}

			const isWebGL2 = capabilities.isWebGL2;

			if ( _transmissionRenderTarget === null ) {

				_transmissionRenderTarget = new WebGLRenderTarget( 1, 1, {
					generateMipmaps: true,
					type: extensions.has( 'EXT_color_buffer_half_float' ) ? HalfFloatType : UnsignedByteType,
					minFilter: LinearMipmapLinearFilter,
					samples: ( isWebGL2 ) ? 4 : 0
				} );

				// debug

				/*
				const geometry = new PlaneGeometry();
				const material = new MeshBasicMaterial( { map: _transmissionRenderTarget.texture } );

				const mesh = new Mesh( geometry, material );
				scene.add( mesh );
				*/

			}

			_this.getDrawingBufferSize( _vector2 );

			if ( isWebGL2 ) {

				_transmissionRenderTarget.setSize( _vector2.x, _vector2.y );

			} else {

				_transmissionRenderTarget.setSize( floorPowerOfTwo( _vector2.x ), floorPowerOfTwo( _vector2.y ) );

			}

			//

			const currentRenderTarget = _this.getRenderTarget();
			_this.setRenderTarget( _transmissionRenderTarget );

			_this.getClearColor( _currentClearColor );
			_currentClearAlpha = _this.getClearAlpha();
			if ( _currentClearAlpha < 1 ) _this.setClearColor( 0xffffff, 0.5 );

			_this.clear();

			// Turn off the features which can affect the frag color for opaque objects pass.
			// Otherwise they are applied twice in opaque objects pass and transmission objects pass.
			const currentToneMapping = _this.toneMapping;
			_this.toneMapping = NoToneMapping;

			renderObjects( opaqueObjects, scene, camera );

			textures.updateMultisampleRenderTarget( _transmissionRenderTarget );
			textures.updateRenderTargetMipmap( _transmissionRenderTarget );

			let renderTargetNeedsUpdate = false;

			for ( let i = 0, l = transmissiveObjects.length; i < l; i ++ ) {

				const renderItem = transmissiveObjects[ i ];

				const object = renderItem.object;
				const geometry = renderItem.geometry;
				const material = renderItem.material;
				const group = renderItem.group;

				if ( material.side === DoubleSide && object.layers.test( camera.layers ) ) {

					const currentSide = material.side;

					material.side = BackSide;
					material.needsUpdate = true;

					renderObject( object, scene, camera, geometry, material, group );

					material.side = currentSide;
					material.needsUpdate = true;

					renderTargetNeedsUpdate = true;

				}

			}

			if ( renderTargetNeedsUpdate === true ) {

				textures.updateMultisampleRenderTarget( _transmissionRenderTarget );
				textures.updateRenderTargetMipmap( _transmissionRenderTarget );

			}

			_this.setRenderTarget( currentRenderTarget );

			_this.setClearColor( _currentClearColor, _currentClearAlpha );

			_this.toneMapping = currentToneMapping;

		}

    // 渲染各种类型的 renderList 列表
		function renderObjects( renderList, scene, camera ) {

      // 设置有没有场景指定的材质
			const overrideMaterial = scene.isScene === true ? scene.overrideMaterial : null;

			for ( let i = 0, l = renderList.length; i < l; i ++ ) {

				const renderItem = renderList[ i ];

				const object = renderItem.object;
				const geometry = renderItem.geometry;
        // 有指定材质用指定材质
				const material = overrideMaterial === null ? renderItem.material : overrideMaterial;
				const group = renderItem.group;

        // 再次测试物体层级与相机层级，ps：projectObject 时也测试了一次看是否添加到 renderList
				if ( object.layers.test( camera.layers ) ) {

          // 调用 renderObject 渲染物体
					renderObject( object, scene, camera, geometry, material, group );

				}

			}

		}

    // 渲染物体
		function renderObject( object, scene, camera, geometry, material, group ) {

      // 运行 onBeforeRender 注册回调
			object.onBeforeRender( _this, scene, camera, geometry, material, group );

      // 计算模型视图矩阵
      // modelViewMatrix 会直接传递给着色器
			object.modelViewMatrix.multiplyMatrices( camera.matrixWorldInverse, object.matrixWorld );
      // 根据模型视图矩阵去设置法线变换矩阵（正规矩阵），为三维矩阵
			object.normalMatrix.getNormalMatrix( object.modelViewMatrix );

      // 运行材质的 onBeforeRender 注册回调
			material.onBeforeRender( _this, scene, camera, geometry, object, group );

			if ( material.transparent === true && material.side === DoubleSide && material.forceSinglePass === false ) {

        // 材质是透明材质，又是双面渲染，而且 forceSinglePass 强制单通道渲染也关闭的情况下，进行两次渲染
				material.side = BackSide;
				material.needsUpdate = true;
        // 渲染背面
				_this.renderBufferDirect( camera, scene, geometry, material, object, group );

				material.side = FrontSide;
				material.needsUpdate = true;
        // 渲染前面
				_this.renderBufferDirect( camera, scene, geometry, material, object, group );

				material.side = DoubleSide;

			} else {

        // 通过 renderBufferDirect 渲染物体
				_this.renderBufferDirect( camera, scene, geometry, material, object, group );

			}

      // 运行 onAfterRender 注册回调
			object.onAfterRender( _this, scene, camera, geometry, material, group );

		}

    // 根据材质设置了一些全局的 uniform 变量？
		function getProgram( material, scene, object ) {

			if ( scene.isScene !== true ) scene = _emptyScene; // scene could be a Mesh, Line, Points, ...

      // 根据 material 去获取材质属性缓存
			const materialProperties = properties.get( material );

			const lights = currentRenderState.state.lights;
			const shadowsArray = currentRenderState.state.shadowsArray;

			const lightsStateVersion = lights.state.version;

			const parameters = programCache.getParameters( material, lights.state, shadowsArray, scene, object );
			const programCacheKey = programCache.getProgramCacheKey( parameters );

			let programs = materialProperties.programs;

			// always update environment and fog - changing these trigger an getProgram call, but it's possible that the program doesn't change

			materialProperties.environment = material.isMeshStandardMaterial ? scene.environment : null;
			materialProperties.fog = scene.fog;
			materialProperties.envMap = ( material.isMeshStandardMaterial ? cubeuvmaps : cubemaps ).get( material.envMap || materialProperties.environment );

			if ( programs === undefined ) {

				// new material
        // programs 为空说明是新材质
				material.addEventListener( 'dispose', onMaterialDispose );

				programs = new Map();
				materialProperties.programs = programs;

			}

			let program = programs.get( programCacheKey );

			if ( program !== undefined ) {

				// early out if program and light state is identical

				if ( materialProperties.currentProgram === program && materialProperties.lightsStateVersion === lightsStateVersion ) {

					updateCommonMaterialProperties( material, parameters );

					return program;

				}

			} else {

				parameters.uniforms = programCache.getUniforms( material );

				material.onBuild( object, parameters, _this );

				material.onBeforeCompile( parameters, _this );

				program = programCache.acquireProgram( parameters, programCacheKey );
				programs.set( programCacheKey, program );

				materialProperties.uniforms = parameters.uniforms;

			}

			const uniforms = materialProperties.uniforms;

			if ( ( ! material.isShaderMaterial && ! material.isRawShaderMaterial ) || material.clipping === true ) {

				uniforms.clippingPlanes = clipping.uniform;

			}

			updateCommonMaterialProperties( material, parameters );

			// store the light setup it was created for

			materialProperties.needsLights = materialNeedsLights( material );
			materialProperties.lightsStateVersion = lightsStateVersion;

			if ( materialProperties.needsLights ) {

				// wire up the material to this renderer's lighting state

				uniforms.ambientLightColor.value = lights.state.ambient;
				uniforms.lightProbe.value = lights.state.probe;
				uniforms.directionalLights.value = lights.state.directional;
				uniforms.directionalLightShadows.value = lights.state.directionalShadow;
				uniforms.spotLights.value = lights.state.spot;
				uniforms.spotLightShadows.value = lights.state.spotShadow;
				uniforms.rectAreaLights.value = lights.state.rectArea;
				uniforms.ltc_1.value = lights.state.rectAreaLTC1;
				uniforms.ltc_2.value = lights.state.rectAreaLTC2;
				uniforms.pointLights.value = lights.state.point;
				uniforms.pointLightShadows.value = lights.state.pointShadow;
				uniforms.hemisphereLights.value = lights.state.hemi;

				uniforms.directionalShadowMap.value = lights.state.directionalShadowMap;
				uniforms.directionalShadowMatrix.value = lights.state.directionalShadowMatrix;
				uniforms.spotShadowMap.value = lights.state.spotShadowMap;
				uniforms.spotLightMatrix.value = lights.state.spotLightMatrix;
				uniforms.spotLightMap.value = lights.state.spotLightMap;
				uniforms.pointShadowMap.value = lights.state.pointShadowMap;
				uniforms.pointShadowMatrix.value = lights.state.pointShadowMatrix;
				// TODO (abelnation): add area lights shadow info to uniforms

			}

			materialProperties.currentProgram = program;
			materialProperties.uniformsList = null;

			return program;

		}

		function getUniformList( materialProperties ) {

			if ( materialProperties.uniformsList === null ) {

				const progUniforms = materialProperties.currentProgram.getUniforms();
				materialProperties.uniformsList = WebGLUniforms.seqWithValue( progUniforms.seq, materialProperties.uniforms );

			}

			return materialProperties.uniformsList;

		}

		function updateCommonMaterialProperties( material, parameters ) {

			const materialProperties = properties.get( material );

			materialProperties.outputColorSpace = parameters.outputColorSpace;
			materialProperties.batching = parameters.batching;
			materialProperties.instancing = parameters.instancing;
			materialProperties.instancingColor = parameters.instancingColor;
			materialProperties.skinning = parameters.skinning;
			materialProperties.morphTargets = parameters.morphTargets;
			materialProperties.morphNormals = parameters.morphNormals;
			materialProperties.morphColors = parameters.morphColors;
			materialProperties.morphTargetsCount = parameters.morphTargetsCount;
			materialProperties.numClippingPlanes = parameters.numClippingPlanes;
			materialProperties.numIntersection = parameters.numClipIntersection;
			materialProperties.vertexAlphas = parameters.vertexAlphas;
			materialProperties.vertexTangents = parameters.vertexTangents;
			materialProperties.toneMapping = parameters.toneMapping;

		}

		function setProgram( camera, scene, geometry, material, object ) {

			if ( scene.isScene !== true ) scene = _emptyScene; // scene could be a Mesh, Line, Points, ...

			textures.resetTextureUnits();

			const fog = scene.fog;
			const environment = material.isMeshStandardMaterial ? scene.environment : null;
			const colorSpace = ( _currentRenderTarget === null ) ? _this.outputColorSpace : ( _currentRenderTarget.isXRRenderTarget === true ? _currentRenderTarget.texture.colorSpace : LinearSRGBColorSpace );
			const envMap = ( material.isMeshStandardMaterial ? cubeuvmaps : cubemaps ).get( material.envMap || environment );
			const vertexAlphas = material.vertexColors === true && !! geometry.attributes.color && geometry.attributes.color.itemSize === 4;
			const vertexTangents = !! geometry.attributes.tangent && ( !! material.normalMap || material.anisotropy > 0 );
			const morphTargets = !! geometry.morphAttributes.position;
			const morphNormals = !! geometry.morphAttributes.normal;
			const morphColors = !! geometry.morphAttributes.color;

			let toneMapping = NoToneMapping;

			if ( material.toneMapped ) {

				if ( _currentRenderTarget === null || _currentRenderTarget.isXRRenderTarget === true ) {

					toneMapping = _this.toneMapping;

				}

			}

			const morphAttribute = geometry.morphAttributes.position || geometry.morphAttributes.normal || geometry.morphAttributes.color;
			const morphTargetsCount = ( morphAttribute !== undefined ) ? morphAttribute.length : 0;

			const materialProperties = properties.get( material );
			const lights = currentRenderState.state.lights;

			if ( _clippingEnabled === true ) {

				if ( _localClippingEnabled === true || camera !== _currentCamera ) {

					const useCache =
						camera === _currentCamera &&
						material.id === _currentMaterialId;

					// we might want to call this function with some ClippingGroup
					// object instead of the material, once it becomes feasible
					// (#8465, #8379)
					clipping.setState( material, camera, useCache );

				}

			}

			//

			let needsProgramChange = false;

			if ( material.version === materialProperties.__version ) {

				if ( materialProperties.needsLights && ( materialProperties.lightsStateVersion !== lights.state.version ) ) {

					needsProgramChange = true;

				} else if ( materialProperties.outputColorSpace !== colorSpace ) {

					needsProgramChange = true;

				} else if ( object.isBatchedMesh && materialProperties.batching === false ) {

					needsProgramChange = true;

				} else if ( ! object.isBatchedMesh && materialProperties.batching === true ) {

					needsProgramChange = true;

				} else if ( object.isInstancedMesh && materialProperties.instancing === false ) {

					needsProgramChange = true;

				} else if ( ! object.isInstancedMesh && materialProperties.instancing === true ) {

					needsProgramChange = true;

				} else if ( object.isSkinnedMesh && materialProperties.skinning === false ) {

					needsProgramChange = true;

				} else if ( ! object.isSkinnedMesh && materialProperties.skinning === true ) {

					needsProgramChange = true;

				} else if ( object.isInstancedMesh && materialProperties.instancingColor === true && object.instanceColor === null ) {

					needsProgramChange = true;

				} else if ( object.isInstancedMesh && materialProperties.instancingColor === false && object.instanceColor !== null ) {

					needsProgramChange = true;

				} else if ( materialProperties.envMap !== envMap ) {

					needsProgramChange = true;

				} else if ( material.fog === true && materialProperties.fog !== fog ) {

					needsProgramChange = true;

				} else if ( materialProperties.numClippingPlanes !== undefined &&
					( materialProperties.numClippingPlanes !== clipping.numPlanes ||
					materialProperties.numIntersection !== clipping.numIntersection ) ) {

					needsProgramChange = true;

				} else if ( materialProperties.vertexAlphas !== vertexAlphas ) {

					needsProgramChange = true;

				} else if ( materialProperties.vertexTangents !== vertexTangents ) {

					needsProgramChange = true;

				} else if ( materialProperties.morphTargets !== morphTargets ) {

					needsProgramChange = true;

				} else if ( materialProperties.morphNormals !== morphNormals ) {

					needsProgramChange = true;

				} else if ( materialProperties.morphColors !== morphColors ) {

					needsProgramChange = true;

				} else if ( materialProperties.toneMapping !== toneMapping ) {

					needsProgramChange = true;

				} else if ( capabilities.isWebGL2 === true && materialProperties.morphTargetsCount !== morphTargetsCount ) {

					needsProgramChange = true;

				}

			} else {

				needsProgramChange = true;
				materialProperties.__version = material.version;

			}

			//

			let program = materialProperties.currentProgram;

			if ( needsProgramChange === true ) {

				program = getProgram( material, scene, object );

			}

			let refreshProgram = false;
			let refreshMaterial = false;
			let refreshLights = false;

      // 获取 program 的 uniform 管理对象
			const p_uniforms = program.getUniforms(),
				m_uniforms = materialProperties.uniforms;

			if ( state.useProgram( program.program ) ) {

				refreshProgram = true;
				refreshMaterial = true;
				refreshLights = true;

			}

			if ( material.id !== _currentMaterialId ) {

				_currentMaterialId = material.id;

				refreshMaterial = true;

			}

			if ( refreshProgram || _currentCamera !== camera ) {

				// common camera uniforms

				p_uniforms.setValue( _gl, 'projectionMatrix', camera.projectionMatrix );
				p_uniforms.setValue( _gl, 'viewMatrix', camera.matrixWorldInverse );

				const uCamPos = p_uniforms.map.cameraPosition;

				if ( uCamPos !== undefined ) {

					uCamPos.setValue( _gl, _vector3.setFromMatrixPosition( camera.matrixWorld ) );

				}

				if ( capabilities.logarithmicDepthBuffer ) {

					p_uniforms.setValue( _gl, 'logDepthBufFC',
						2.0 / ( Math.log( camera.far + 1.0 ) / Math.LN2 ) );

				}

				// consider moving isOrthographic to UniformLib and WebGLMaterials, see https://github.com/mrdoob/three.js/pull/26467#issuecomment-1645185067

				if ( material.isMeshPhongMaterial ||
					material.isMeshToonMaterial ||
					material.isMeshLambertMaterial ||
					material.isMeshBasicMaterial ||
					material.isMeshStandardMaterial ||
					material.isShaderMaterial ) {

					p_uniforms.setValue( _gl, 'isOrthographic', camera.isOrthographicCamera === true );

				}

				if ( _currentCamera !== camera ) {

					_currentCamera = camera;

					// lighting uniforms depend on the camera so enforce an update
					// now, in case this material supports lights - or later, when
					// the next material that does gets activated:

					refreshMaterial = true;		// set to true on material change
					refreshLights = true;		// remains set until update done

				}

			}

			// skinning and morph target uniforms must be set even if material didn't change
			// auto-setting of texture unit for bone and morph texture must go before other textures
			// otherwise textures used for skinning and morphing can take over texture units reserved for other material textures

			if ( object.isSkinnedMesh ) {

				p_uniforms.setOptional( _gl, object, 'bindMatrix' );
				p_uniforms.setOptional( _gl, object, 'bindMatrixInverse' );

				const skeleton = object.skeleton;

				if ( skeleton ) {

					if ( capabilities.floatVertexTextures ) {

						if ( skeleton.boneTexture === null ) skeleton.computeBoneTexture();

						p_uniforms.setValue( _gl, 'boneTexture', skeleton.boneTexture, textures );

					} else {

						console.warn( 'THREE.WebGLRenderer: SkinnedMesh can only be used with WebGL 2. With WebGL 1 OES_texture_float and vertex textures support is required.' );

					}

				}

			}

			if ( object.isBatchedMesh ) {

				p_uniforms.setOptional( _gl, object, 'batchingTexture' );
				p_uniforms.setValue( _gl, 'batchingTexture', object._matricesTexture, textures );

			}

			const morphAttributes = geometry.morphAttributes;

			if ( morphAttributes.position !== undefined || morphAttributes.normal !== undefined || ( morphAttributes.color !== undefined && capabilities.isWebGL2 === true ) ) {

				morphtargets.update( object, geometry, program );

			}

			if ( refreshMaterial || materialProperties.receiveShadow !== object.receiveShadow ) {

				materialProperties.receiveShadow = object.receiveShadow;
				p_uniforms.setValue( _gl, 'receiveShadow', object.receiveShadow );

			}

			// https://github.com/mrdoob/three.js/pull/24467#issuecomment-1209031512

			if ( material.isMeshGouraudMaterial && material.envMap !== null ) {

				m_uniforms.envMap.value = envMap;

				m_uniforms.flipEnvMap.value = ( envMap.isCubeTexture && envMap.isRenderTargetTexture === false ) ? - 1 : 1;

			}

			if ( refreshMaterial ) {

				p_uniforms.setValue( _gl, 'toneMappingExposure', _this.toneMappingExposure );

				if ( materialProperties.needsLights ) {

					// the current material requires lighting info

					// note: all lighting uniforms are always set correctly
					// they simply reference the renderer's state for their
					// values
					//
					// use the current material's .needsUpdate flags to set
					// the GL state when required

					markUniformsLightsNeedsUpdate( m_uniforms, refreshLights );

				}

				// refresh uniforms common to several materials

				if ( fog && material.fog === true ) {

					materials.refreshFogUniforms( m_uniforms, fog );

				}

				materials.refreshMaterialUniforms( m_uniforms, material, _pixelRatio, _height, _transmissionRenderTarget );

				WebGLUniforms.upload( _gl, getUniformList( materialProperties ), m_uniforms, textures );

			}

			if ( material.isShaderMaterial && material.uniformsNeedUpdate === true ) {

				WebGLUniforms.upload( _gl, getUniformList( materialProperties ), m_uniforms, textures );
				material.uniformsNeedUpdate = false;

			}

			if ( material.isSpriteMaterial ) {

				p_uniforms.setValue( _gl, 'center', object.center );

			}

			// common matrices

			p_uniforms.setValue( _gl, 'modelViewMatrix', object.modelViewMatrix );
			p_uniforms.setValue( _gl, 'normalMatrix', object.normalMatrix );
			p_uniforms.setValue( _gl, 'modelMatrix', object.matrixWorld );

			// UBOs

			if ( material.isShaderMaterial || material.isRawShaderMaterial ) {

				const groups = material.uniformsGroups;

				for ( let i = 0, l = groups.length; i < l; i ++ ) {

					if ( capabilities.isWebGL2 ) {

						const group = groups[ i ];

						uniformsGroups.update( group, program );
						uniformsGroups.bind( group, program );

					} else {

						console.warn( 'THREE.WebGLRenderer: Uniform Buffer Objects can only be used with WebGL 2.' );

					}

				}

			}

			return program;

		}

		// If uniforms are marked as clean, they don't need to be loaded to the GPU.

		function markUniformsLightsNeedsUpdate( uniforms, value ) {

			uniforms.ambientLightColor.needsUpdate = value;
			uniforms.lightProbe.needsUpdate = value;

			uniforms.directionalLights.needsUpdate = value;
			uniforms.directionalLightShadows.needsUpdate = value;
			uniforms.pointLights.needsUpdate = value;
			uniforms.pointLightShadows.needsUpdate = value;
			uniforms.spotLights.needsUpdate = value;
			uniforms.spotLightShadows.needsUpdate = value;
			uniforms.rectAreaLights.needsUpdate = value;
			uniforms.hemisphereLights.needsUpdate = value;

		}

		function materialNeedsLights( material ) {

			return material.isMeshLambertMaterial || material.isMeshToonMaterial || material.isMeshPhongMaterial ||
				material.isMeshStandardMaterial || material.isShadowMaterial ||
				( material.isShaderMaterial && material.lights === true );

		}

		this.getActiveCubeFace = function () {

			return _currentActiveCubeFace;

		};

		this.getActiveMipmapLevel = function () {

			return _currentActiveMipmapLevel;

		};

		this.getRenderTarget = function () {

			return _currentRenderTarget;

		};

		this.setRenderTargetTextures = function ( renderTarget, colorTexture, depthTexture ) {

			properties.get( renderTarget.texture ).__webglTexture = colorTexture;
			properties.get( renderTarget.depthTexture ).__webglTexture = depthTexture;

			const renderTargetProperties = properties.get( renderTarget );
			renderTargetProperties.__hasExternalTextures = true;

			if ( renderTargetProperties.__hasExternalTextures ) {

				renderTargetProperties.__autoAllocateDepthBuffer = depthTexture === undefined;

				if ( ! renderTargetProperties.__autoAllocateDepthBuffer ) {

					// The multisample_render_to_texture extension doesn't work properly if there
					// are midframe flushes and an external depth buffer. Disable use of the extension.
					if ( extensions.has( 'WEBGL_multisampled_render_to_texture' ) === true ) {

						console.warn( 'THREE.WebGLRenderer: Render-to-texture extension was disabled because an external texture was provided' );
						renderTargetProperties.__useRenderToTexture = false;

					}

				}

			}

		};

		this.setRenderTargetFramebuffer = function ( renderTarget, defaultFramebuffer ) {

			const renderTargetProperties = properties.get( renderTarget );
			renderTargetProperties.__webglFramebuffer = defaultFramebuffer;
			renderTargetProperties.__useDefaultFramebuffer = defaultFramebuffer === undefined;

		};

		this.setRenderTarget = function ( renderTarget, activeCubeFace = 0, activeMipmapLevel = 0 ) {

			_currentRenderTarget = renderTarget;
			_currentActiveCubeFace = activeCubeFace;
			_currentActiveMipmapLevel = activeMipmapLevel;

			let useDefaultFramebuffer = true;
			let framebuffer = null;
			let isCube = false;
			let isRenderTarget3D = false;

			if ( renderTarget ) {

				const renderTargetProperties = properties.get( renderTarget );

				if ( renderTargetProperties.__useDefaultFramebuffer !== undefined ) {

					// We need to make sure to rebind the framebuffer.
					state.bindFramebuffer( _gl.FRAMEBUFFER, null );
					useDefaultFramebuffer = false;

				} else if ( renderTargetProperties.__webglFramebuffer === undefined ) {

					textures.setupRenderTarget( renderTarget );

				} else if ( renderTargetProperties.__hasExternalTextures ) {

					// Color and depth texture must be rebound in order for the swapchain to update.
					textures.rebindTextures( renderTarget, properties.get( renderTarget.texture ).__webglTexture, properties.get( renderTarget.depthTexture ).__webglTexture );

				}

				const texture = renderTarget.texture;

				if ( texture.isData3DTexture || texture.isDataArrayTexture || texture.isCompressedArrayTexture ) {

					isRenderTarget3D = true;

				}

				const __webglFramebuffer = properties.get( renderTarget ).__webglFramebuffer;

				if ( renderTarget.isWebGLCubeRenderTarget ) {

					if ( Array.isArray( __webglFramebuffer[ activeCubeFace ] ) ) {

						framebuffer = __webglFramebuffer[ activeCubeFace ][ activeMipmapLevel ];

					} else {

						framebuffer = __webglFramebuffer[ activeCubeFace ];

					}

					isCube = true;

				} else if ( ( capabilities.isWebGL2 && renderTarget.samples > 0 ) && textures.useMultisampledRTT( renderTarget ) === false ) {

					framebuffer = properties.get( renderTarget ).__webglMultisampledFramebuffer;

				} else {

					if ( Array.isArray( __webglFramebuffer ) ) {

						framebuffer = __webglFramebuffer[ activeMipmapLevel ];

					} else {

						framebuffer = __webglFramebuffer;

					}

				}

				_currentViewport.copy( renderTarget.viewport );
				_currentScissor.copy( renderTarget.scissor );
				_currentScissorTest = renderTarget.scissorTest;

			} else {

				_currentViewport.copy( _viewport ).multiplyScalar( _pixelRatio ).floor();
				_currentScissor.copy( _scissor ).multiplyScalar( _pixelRatio ).floor();
				_currentScissorTest = _scissorTest;

			}

			const framebufferBound = state.bindFramebuffer( _gl.FRAMEBUFFER, framebuffer );

			if ( framebufferBound && capabilities.drawBuffers && useDefaultFramebuffer ) {

				state.drawBuffers( renderTarget, framebuffer );

			}

			state.viewport( _currentViewport );
			state.scissor( _currentScissor );
			state.setScissorTest( _currentScissorTest );

			if ( isCube ) {

				const textureProperties = properties.get( renderTarget.texture );
				_gl.framebufferTexture2D( _gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_CUBE_MAP_POSITIVE_X + activeCubeFace, textureProperties.__webglTexture, activeMipmapLevel );

			} else if ( isRenderTarget3D ) {

				const textureProperties = properties.get( renderTarget.texture );
				const layer = activeCubeFace || 0;
				_gl.framebufferTextureLayer( _gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, textureProperties.__webglTexture, activeMipmapLevel || 0, layer );

			}

			_currentMaterialId = - 1; // reset current material to ensure correct uniform bindings

		};

		this.readRenderTargetPixels = function ( renderTarget, x, y, width, height, buffer, activeCubeFaceIndex ) {

			if ( ! ( renderTarget && renderTarget.isWebGLRenderTarget ) ) {

				console.error( 'THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.' );
				return;

			}

			let framebuffer = properties.get( renderTarget ).__webglFramebuffer;

			if ( renderTarget.isWebGLCubeRenderTarget && activeCubeFaceIndex !== undefined ) {

				framebuffer = framebuffer[ activeCubeFaceIndex ];

			}

			if ( framebuffer ) {

				state.bindFramebuffer( _gl.FRAMEBUFFER, framebuffer );

				try {

					const texture = renderTarget.texture;
					const textureFormat = texture.format;
					const textureType = texture.type;

					if ( textureFormat !== RGBAFormat && utils.convert( textureFormat ) !== _gl.getParameter( _gl.IMPLEMENTATION_COLOR_READ_FORMAT ) ) {

						console.error( 'THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.' );
						return;

					}

					const halfFloatSupportedByExt = ( textureType === HalfFloatType ) && ( extensions.has( 'EXT_color_buffer_half_float' ) || ( capabilities.isWebGL2 && extensions.has( 'EXT_color_buffer_float' ) ) );

					if ( textureType !== UnsignedByteType && utils.convert( textureType ) !== _gl.getParameter( _gl.IMPLEMENTATION_COLOR_READ_TYPE ) && // Edge and Chrome Mac < 52 (#9513)
						! ( textureType === FloatType && ( capabilities.isWebGL2 || extensions.has( 'OES_texture_float' ) || extensions.has( 'WEBGL_color_buffer_float' ) ) ) && // Chrome Mac >= 52 and Firefox
						! halfFloatSupportedByExt ) {

						console.error( 'THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.' );
						return;

					}

					// the following if statement ensures valid read requests (no out-of-bounds pixels, see #8604)

					if ( ( x >= 0 && x <= ( renderTarget.width - width ) ) && ( y >= 0 && y <= ( renderTarget.height - height ) ) ) {

						_gl.readPixels( x, y, width, height, utils.convert( textureFormat ), utils.convert( textureType ), buffer );

					}

				} finally {

					// restore framebuffer of current render target if necessary

					const framebuffer = ( _currentRenderTarget !== null ) ? properties.get( _currentRenderTarget ).__webglFramebuffer : null;
					state.bindFramebuffer( _gl.FRAMEBUFFER, framebuffer );

				}

			}

		};

		this.copyFramebufferToTexture = function ( position, texture, level = 0 ) {

			const levelScale = Math.pow( 2, - level );
			const width = Math.floor( texture.image.width * levelScale );
			const height = Math.floor( texture.image.height * levelScale );

			textures.setTexture2D( texture, 0 );

			_gl.copyTexSubImage2D( _gl.TEXTURE_2D, level, 0, 0, position.x, position.y, width, height );

			state.unbindTexture();

		};

		this.copyTextureToTexture = function ( position, srcTexture, dstTexture, level = 0 ) {

			const width = srcTexture.image.width;
			const height = srcTexture.image.height;
			const glFormat = utils.convert( dstTexture.format );
			const glType = utils.convert( dstTexture.type );

			textures.setTexture2D( dstTexture, 0 );

			// As another texture upload may have changed pixelStorei
			// parameters, make sure they are correct for the dstTexture
			_gl.pixelStorei( _gl.UNPACK_FLIP_Y_WEBGL, dstTexture.flipY );
			_gl.pixelStorei( _gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, dstTexture.premultiplyAlpha );
			_gl.pixelStorei( _gl.UNPACK_ALIGNMENT, dstTexture.unpackAlignment );

			if ( srcTexture.isDataTexture ) {

				_gl.texSubImage2D( _gl.TEXTURE_2D, level, position.x, position.y, width, height, glFormat, glType, srcTexture.image.data );

			} else {

				if ( srcTexture.isCompressedTexture ) {

					_gl.compressedTexSubImage2D( _gl.TEXTURE_2D, level, position.x, position.y, srcTexture.mipmaps[ 0 ].width, srcTexture.mipmaps[ 0 ].height, glFormat, srcTexture.mipmaps[ 0 ].data );

				} else {

					_gl.texSubImage2D( _gl.TEXTURE_2D, level, position.x, position.y, glFormat, glType, srcTexture.image );

				}

			}

			// Generate mipmaps only when copying level 0
			if ( level === 0 && dstTexture.generateMipmaps ) _gl.generateMipmap( _gl.TEXTURE_2D );

			state.unbindTexture();

		};

		this.copyTextureToTexture3D = function ( sourceBox, position, srcTexture, dstTexture, level = 0 ) {

			if ( _this.isWebGL1Renderer ) {

				console.warn( 'THREE.WebGLRenderer.copyTextureToTexture3D: can only be used with WebGL2.' );
				return;

			}

			const width = sourceBox.max.x - sourceBox.min.x + 1;
			const height = sourceBox.max.y - sourceBox.min.y + 1;
			const depth = sourceBox.max.z - sourceBox.min.z + 1;
			const glFormat = utils.convert( dstTexture.format );
			const glType = utils.convert( dstTexture.type );
			let glTarget;

			if ( dstTexture.isData3DTexture ) {

				textures.setTexture3D( dstTexture, 0 );
				glTarget = _gl.TEXTURE_3D;

			} else if ( dstTexture.isDataArrayTexture || dstTexture.isCompressedArrayTexture ) {

				textures.setTexture2DArray( dstTexture, 0 );
				glTarget = _gl.TEXTURE_2D_ARRAY;

			} else {

				console.warn( 'THREE.WebGLRenderer.copyTextureToTexture3D: only supports THREE.DataTexture3D and THREE.DataTexture2DArray.' );
				return;

			}

			_gl.pixelStorei( _gl.UNPACK_FLIP_Y_WEBGL, dstTexture.flipY );
			_gl.pixelStorei( _gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, dstTexture.premultiplyAlpha );
			_gl.pixelStorei( _gl.UNPACK_ALIGNMENT, dstTexture.unpackAlignment );

			const unpackRowLen = _gl.getParameter( _gl.UNPACK_ROW_LENGTH );
			const unpackImageHeight = _gl.getParameter( _gl.UNPACK_IMAGE_HEIGHT );
			const unpackSkipPixels = _gl.getParameter( _gl.UNPACK_SKIP_PIXELS );
			const unpackSkipRows = _gl.getParameter( _gl.UNPACK_SKIP_ROWS );
			const unpackSkipImages = _gl.getParameter( _gl.UNPACK_SKIP_IMAGES );

			const image = srcTexture.isCompressedTexture ? srcTexture.mipmaps[ level ] : srcTexture.image;

			_gl.pixelStorei( _gl.UNPACK_ROW_LENGTH, image.width );
			_gl.pixelStorei( _gl.UNPACK_IMAGE_HEIGHT, image.height );
			_gl.pixelStorei( _gl.UNPACK_SKIP_PIXELS, sourceBox.min.x );
			_gl.pixelStorei( _gl.UNPACK_SKIP_ROWS, sourceBox.min.y );
			_gl.pixelStorei( _gl.UNPACK_SKIP_IMAGES, sourceBox.min.z );

			if ( srcTexture.isDataTexture || srcTexture.isData3DTexture ) {

				_gl.texSubImage3D( glTarget, level, position.x, position.y, position.z, width, height, depth, glFormat, glType, image.data );

			} else {

				if ( srcTexture.isCompressedArrayTexture ) {

					console.warn( 'THREE.WebGLRenderer.copyTextureToTexture3D: untested support for compressed srcTexture.' );
					_gl.compressedTexSubImage3D( glTarget, level, position.x, position.y, position.z, width, height, depth, glFormat, image.data );

				} else {

					_gl.texSubImage3D( glTarget, level, position.x, position.y, position.z, width, height, depth, glFormat, glType, image );

				}

			}

			_gl.pixelStorei( _gl.UNPACK_ROW_LENGTH, unpackRowLen );
			_gl.pixelStorei( _gl.UNPACK_IMAGE_HEIGHT, unpackImageHeight );
			_gl.pixelStorei( _gl.UNPACK_SKIP_PIXELS, unpackSkipPixels );
			_gl.pixelStorei( _gl.UNPACK_SKIP_ROWS, unpackSkipRows );
			_gl.pixelStorei( _gl.UNPACK_SKIP_IMAGES, unpackSkipImages );

			// Generate mipmaps only when copying level 0
			if ( level === 0 && dstTexture.generateMipmaps ) _gl.generateMipmap( glTarget );

			state.unbindTexture();

		};

		this.initTexture = function ( texture ) {

			if ( texture.isCubeTexture ) {

				textures.setTextureCube( texture, 0 );

			} else if ( texture.isData3DTexture ) {

				textures.setTexture3D( texture, 0 );

			} else if ( texture.isDataArrayTexture || texture.isCompressedArrayTexture ) {

				textures.setTexture2DArray( texture, 0 );

			} else {

				textures.setTexture2D( texture, 0 );

			}

			state.unbindTexture();

		};

		this.resetState = function () {

			_currentActiveCubeFace = 0;
			_currentActiveMipmapLevel = 0;
			_currentRenderTarget = null;

			state.reset();
			bindingStates.reset();

		};

		if ( typeof __THREE_DEVTOOLS__ !== 'undefined' ) {

			__THREE_DEVTOOLS__.dispatchEvent( new CustomEvent( 'observe', { detail: this } ) );

		}

	}

	get coordinateSystem() {

		return WebGLCoordinateSystem;

	}

	get outputColorSpace() {

		return this._outputColorSpace;

	}

	set outputColorSpace( colorSpace ) {

		this._outputColorSpace = colorSpace;

		const gl = this.getContext();
		gl.drawingBufferColorSpace = colorSpace === DisplayP3ColorSpace ? 'display-p3' : 'srgb';
		gl.unpackColorSpace = ColorManagement.workingColorSpace === LinearDisplayP3ColorSpace ? 'display-p3' : 'srgb';

	}

	get outputEncoding() { // @deprecated, r152

		console.warn( 'THREE.WebGLRenderer: Property .outputEncoding has been removed. Use .outputColorSpace instead.' );
		return this.outputColorSpace === SRGBColorSpace ? sRGBEncoding : LinearEncoding;

	}

	set outputEncoding( encoding ) { // @deprecated, r152

		console.warn( 'THREE.WebGLRenderer: Property .outputEncoding has been removed. Use .outputColorSpace instead.' );
		this.outputColorSpace = encoding === sRGBEncoding ? SRGBColorSpace : LinearSRGBColorSpace;

	}

	get useLegacyLights() { // @deprecated, r155

		console.warn( 'THREE.WebGLRenderer: The property .useLegacyLights has been deprecated. Migrate your lighting according to the following guide: https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733.' );
		return this._useLegacyLights;

	}

	set useLegacyLights( value ) { // @deprecated, r155

		console.warn( 'THREE.WebGLRenderer: The property .useLegacyLights has been deprecated. Migrate your lighting according to the following guide: https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733.' );
		this._useLegacyLights = value;

	}

}


export { WebGLRenderer };
