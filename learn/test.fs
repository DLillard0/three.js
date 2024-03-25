#version 300 es
precision mediump sampler2DArray;
#define varying in
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
#define gl_FragDepthEXT gl_FragDepth
#define texture2D texture
#define textureCube texture
#define texture2DProj textureProj
#define texture2DLodEXT textureLod
#define texture2DProjLodEXT textureProjLod
#define textureCubeLodEXT textureLod
#define texture2DGradEXT textureGrad
#define texture2DProjGradEXT textureProjGrad
#define textureCubeGradEXT textureGrad
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp samplerCube;
precision highp sampler3D;
precision highp sampler2DArray;
precision highp sampler2DShadow;
precision highp samplerCubeShadow;
precision highp sampler2DArrayShadow;
precision highp isampler2D;
precision highp isampler3D;
precision highp isamplerCube;
precision highp isampler2DArray;
precision highp usampler2D;
precision highp usampler3D;
precision highp usamplerCube;
precision highp usampler2DArray;

#define HIGH_PRECISION
#define SHADER_TYPE MeshPhongMaterial
#define SHADER_NAME 
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
uniform bool isOrthographic;
#define OPAQUE

// http://www.russellcottrell.com/photo/matrixCalculator.htm

// Linear sRGB => XYZ => Linear Display P3
const mat3 LINEAR_SRGB_TO_LINEAR_DISPLAY_P3 = mat3(vec3(0.8224621f, 0.177538f, 0.0f), vec3(0.0331941f, 0.9668058f, 0.0f), vec3(0.0170827f, 0.0723974f, 0.9105199f));

// Linear Display P3 => XYZ => Linear sRGB
const mat3 LINEAR_DISPLAY_P3_TO_LINEAR_SRGB = mat3(vec3(1.2249401f, -0.2249404f, 0.0f), vec3(-0.0420569f, 1.0420571f, 0.0f), vec3(-0.0196376f, -0.0786361f, 1.0982735f));

vec4 LinearSRGBToLinearDisplayP3(in vec4 value) {
  return vec4(value.rgb * LINEAR_SRGB_TO_LINEAR_DISPLAY_P3, value.a);
}

vec4 LinearDisplayP3ToLinearSRGB(in vec4 value) {
  return vec4(value.rgb * LINEAR_DISPLAY_P3_TO_LINEAR_SRGB, value.a);
}

vec4 LinearTransferOETF(in vec4 value) {
  return value;
}

vec4 sRGBTransferOETF(in vec4 value) {
  return vec4(mix(pow(value.rgb, vec3(0.41666f)) * 1.055f - vec3(0.055f), value.rgb * 12.92f, vec3(lessThanEqual(value.rgb, vec3(0.0031308f)))), value.a);
}

// @deprecated, r156
vec4 LinearToLinear(in vec4 value) {
  return value;
}

// @deprecated, r156
vec4 LinearTosRGB(in vec4 value) {
  return sRGBTransferOETF(value);
}

vec4 linearToOutputTexel(vec4 value) {
  return (sRGBTransferOETF(value));
}

#define PHONG

uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;

#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6

#ifndef saturate
// <tonemapping_pars_fragment> may have defined saturate() already
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )

float pow2(const in float x) {
  return x * x;
}
vec3 pow2(const in vec3 x) {
  return x * x;
}
float pow3(const in float x) {
  return x * x * x;
}
float pow4(const in float x) {
  float x2 = x * x;
  return x2 * x2;
}
float max3(const in vec3 v) {
  return max(max(v.x, v.y), v.z);
}
float average(const in vec3 v) {
  return dot(v, vec3(0.3333333f));
}

// expects values in the range of [0,1]x[0,1], returns values in the [0,1] range.
// do not collapse into a single function per: http://byteblacksmith.com/improvements-to-the-canonical-one-liner-glsl-rand-for-opengl-es-2-0/
highp float rand(const in vec2 uv) {

  const highp float a = 12.9898f, b = 78.233f, c = 43758.5453f;
  highp float dt = dot(uv.xy, vec2(a, b)), sn = mod(dt, PI);

  return fract(sin(sn) * c);

}

#ifdef HIGH_PRECISION
float precisionSafeLength(vec3 v) {
  return length(v);
}
#else
float precisionSafeLength(vec3 v) {
  float maxComponent = max3(abs(v));
  return length(v / maxComponent) * maxComponent;
}
#endif

struct IncidentLight {
  vec3 color;
  vec3 direction;
  bool visible;
};

// 反射光模型
struct ReflectedLight {
  vec3 directDiffuse;
  vec3 directSpecular;
  vec3 indirectDiffuse;
  vec3 indirectSpecular;
};

#ifdef USE_ALPHAHASH

varying vec3 vPosition;

#endif

vec3 transformDirection(in vec3 dir, in mat4 matrix) {

  return normalize((matrix * vec4(dir, 0.0f)).xyz);

}

vec3 inverseTransformDirection(in vec3 dir, in mat4 matrix) {

	// dir can be either a direction vector or a normal vector
	// upper-left 3x3 of matrix is assumed to be orthogonal

  return normalize((vec4(dir, 0.0f) * matrix).xyz);

}

mat3 transposeMat3(const in mat3 m) {

  mat3 tmp;

  tmp[0] = vec3(m[0].x, m[1].x, m[2].x);
  tmp[1] = vec3(m[0].y, m[1].y, m[2].y);
  tmp[2] = vec3(m[0].z, m[1].z, m[2].z);

  return tmp;

}

float luminance(const in vec3 rgb) {

	// assumes rgb is in linear color space with sRGB primaries and D65 white point

  const vec3 weights = vec3(0.2126729f, 0.7151522f, 0.0721750f);

  return dot(weights, rgb);

}

bool isPerspectiveMatrix(mat4 m) {

  return m[2][3] == -1.0f;

}

vec2 equirectUv(in vec3 dir) {

	// dir is assumed to be unit length

  float u = atan(dir.z, dir.x) * RECIPROCAL_PI2 + 0.5f;

  float v = asin(clamp(dir.y, -1.0f, 1.0f)) * RECIPROCAL_PI + 0.5f;

  return vec2(u, v);

}

vec3 BRDF_Lambert(const in vec3 diffuseColor) {

  return RECIPROCAL_PI * diffuseColor;

} // validated

vec3 F_Schlick(const in vec3 f0, const in float f90, const in float dotVH) {

	// Original approximation by Christophe Schlick '94
	// float fresnel = pow( 1.0 - dotVH, 5.0 );

	// Optimized variant (presented by Epic at SIGGRAPH '13)
	// https://cdn2.unrealengine.com/Resources/files/2013SiggraphPresentationsNotes-26915738.pdf
  float fresnel = exp2((-5.55473f * dotVH - 6.98316f) * dotVH);

  return f0 * (1.0f - fresnel) + (f90 * fresnel);

} // validated

float F_Schlick(const in float f0, const in float f90, const in float dotVH) {

	// Original approximation by Christophe Schlick '94
	// float fresnel = pow( 1.0 - dotVH, 5.0 );

	// Optimized variant (presented by Epic at SIGGRAPH '13)
	// https://cdn2.unrealengine.com/Resources/files/2013SiggraphPresentationsNotes-26915738.pdf
  float fresnel = exp2((-5.55473f * dotVH - 6.98316f) * dotVH);

  return f0 * (1.0f - fresnel) + (f90 * fresnel);

} // validated

vec3 packNormalToRGB(const in vec3 normal) {
  return normalize(normal) * 0.5f + 0.5f;
}

vec3 unpackRGBToNormal(const in vec3 rgb) {
  return 2.0f * rgb.xyz - 1.0f;
}

const float PackUpscale = 256.f / 255.f; // fraction -> 0..1 (including 1)
const float UnpackDownscale = 255.f / 256.f; // 0..1 -> fraction (excluding 1)

const vec3 PackFactors = vec3(256.f * 256.f * 256.f, 256.f * 256.f, 256.f);
const vec4 UnpackFactors = UnpackDownscale / vec4(PackFactors, 1.f);

const float ShiftRight8 = 1.f / 256.f;

vec4 packDepthToRGBA(const in float v) {
  vec4 r = vec4(fract(v * PackFactors), v);
  r.yzw -= r.xyz * ShiftRight8; // tidy overflow
  return r * PackUpscale;
}

float unpackRGBAToDepth(const in vec4 v) {
  return dot(v, UnpackFactors);
}

vec2 packDepthToRG(in highp float v) {
  return packDepthToRGBA(v).yx;
}

float unpackRGToDepth(const in highp vec2 v) {
  return unpackRGBAToDepth(vec4(v.xy, 0.0f, 0.0f));
}

vec4 pack2HalfToRGBA(vec2 v) {
  vec4 r = vec4(v.x, fract(v.x * 255.0f), v.y, fract(v.y * 255.0f));
  return vec4(r.x - r.y / 255.0f, r.y, r.z - r.w / 255.0f, r.w);
}

vec2 unpackRGBATo2Half(vec4 v) {
  return vec2(v.x + (v.y / 255.0f), v.z + (v.w / 255.0f));
}

// NOTE: viewZ, the z-coordinate in camera space, is negative for points in front of the camera

float viewZToOrthographicDepth(const in float viewZ, const in float near, const in float far) {
	// -near maps to 0; -far maps to 1
  return (viewZ + near) / (near - far);
}

float orthographicDepthToViewZ(const in float depth, const in float near, const in float far) {
	// maps orthographic depth in [ 0, 1 ] to viewZ
  return depth * (near - far) - near;
}

// NOTE: https://twitter.com/gonnavis/status/1377183786949959682

float viewZToPerspectiveDepth(const in float viewZ, const in float near, const in float far) {
	// -near maps to 0; -far maps to 1
  return ((near + viewZ) * far) / ((far - near) * viewZ);
}

float perspectiveDepthToViewZ(const in float depth, const in float near, const in float far) {
	// maps perspective depth in [ 0, 1 ] to viewZ
  return (near * far) / ((far - near) * depth - far);
}

#ifdef DITHERING

	// based on https://www.shadertoy.com/view/MslGR8
vec3 dithering(vec3 color) {
		//Calculate grid position
  float grid_position = rand(gl_FragCoord.xy);

		//Shift the individual colors differently, thus making it even harder to see the dithering pattern
  vec3 dither_shift_RGB = vec3(0.25f / 255.0f, -0.25f / 255.0f, 0.25f / 255.0f);

		//modify shift according to grid position.
  dither_shift_RGB = mix(2.0f * dither_shift_RGB, -2.0f * dither_shift_RGB, grid_position);

		//shift the color by dither_shift
  return color + dither_shift_RGB;
}

#endif

#if defined( USE_COLOR_ALPHA )

varying vec4 vColor;

#elif defined( USE_COLOR )

varying vec3 vColor;

#endif

#if defined( USE_UV ) || defined( USE_ANISOTROPY )

varying vec2 vUv;

#endif
#ifdef USE_MAP

varying vec2 vMapUv;

#endif
#ifdef USE_ALPHAMAP

varying vec2 vAlphaMapUv;

#endif
#ifdef USE_LIGHTMAP

varying vec2 vLightMapUv;

#endif
#ifdef USE_AOMAP

varying vec2 vAoMapUv;

#endif
#ifdef USE_BUMPMAP

varying vec2 vBumpMapUv;

#endif
#ifdef USE_NORMALMAP

varying vec2 vNormalMapUv;

#endif
#ifdef USE_EMISSIVEMAP

varying vec2 vEmissiveMapUv;

#endif
#ifdef USE_METALNESSMAP

varying vec2 vMetalnessMapUv;

#endif
#ifdef USE_ROUGHNESSMAP

varying vec2 vRoughnessMapUv;

#endif
#ifdef USE_ANISOTROPYMAP

varying vec2 vAnisotropyMapUv;

#endif
#ifdef USE_CLEARCOATMAP

varying vec2 vClearcoatMapUv;

#endif
#ifdef USE_CLEARCOAT_NORMALMAP

varying vec2 vClearcoatNormalMapUv;

#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP

varying vec2 vClearcoatRoughnessMapUv;

#endif
#ifdef USE_IRIDESCENCEMAP

varying vec2 vIridescenceMapUv;

#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP

varying vec2 vIridescenceThicknessMapUv;

#endif
#ifdef USE_SHEEN_COLORMAP

varying vec2 vSheenColorMapUv;

#endif
#ifdef USE_SHEEN_ROUGHNESSMAP

varying vec2 vSheenRoughnessMapUv;

#endif
#ifdef USE_SPECULARMAP

varying vec2 vSpecularMapUv;

#endif
#ifdef USE_SPECULAR_COLORMAP

varying vec2 vSpecularColorMapUv;

#endif
#ifdef USE_SPECULAR_INTENSITYMAP

varying vec2 vSpecularIntensityMapUv;

#endif
#ifdef USE_TRANSMISSIONMAP

uniform mat3 transmissionMapTransform;
varying vec2 vTransmissionMapUv;

#endif
#ifdef USE_THICKNESSMAP

uniform mat3 thicknessMapTransform;
varying vec2 vThicknessMapUv;

#endif

#ifdef USE_MAP

uniform sampler2D map;

#endif

#ifdef USE_ALPHAMAP

uniform sampler2D alphaMap;

#endif

#ifdef USE_ALPHATEST
uniform float alphaTest;
#endif

#ifdef USE_ALPHAHASH

	/**
	 * See: https://casual-effects.com/research/Wyman2017Hashed/index.html
	 */

const float ALPHA_HASH_SCALE = 0.05f; // Derived from trials only, and may be changed.

float hash2D(vec2 value) {

  return fract(1.0e4f * sin(17.0f * value.x + 0.1f * value.y) * (0.1f + abs(sin(13.0f * value.y + value.x))));

}

float hash3D(vec3 value) {

  return hash2D(vec2(hash2D(value.xy), value.z));

}

float getAlphaHashThreshold(vec3 position) {

		// Find the discretized derivatives of our coordinates
  float maxDeriv = max(length(dFdx(position.xyz)), length(dFdy(position.xyz)));
  float pixScale = 1.0f / (ALPHA_HASH_SCALE * maxDeriv);

		// Find two nearest log-discretized noise scales
  vec2 pixScales = vec2(exp2(floor(log2(pixScale))), exp2(ceil(log2(pixScale))));

		// Compute alpha thresholds at our two noise scales
  vec2 alpha = vec2(hash3D(floor(pixScales.x * position.xyz)), hash3D(floor(pixScales.y * position.xyz)));

		// Factor to interpolate lerp with
  float lerpFactor = fract(log2(pixScale));

		// Interpolate alpha threshold from noise at two scales
  float x = (1.0f - lerpFactor) * alpha.x + lerpFactor * alpha.y;

		// Pass into CDF to compute uniformly distrib threshold
  float a = min(lerpFactor, 1.0f - lerpFactor);
  vec3 cases = vec3(x * x / (2.0f * a * (1.0f - a)), (x - 0.5f * a) / (1.0f - a), 1.0f - ((1.0f - x) * (1.0f - x) / (2.0f * a * (1.0f - a))));

		// Find our final, uniformly distributed alpha threshold (ατ)
  float threshold = (x < (1.0f - a)) ? ((x < a) ? cases.x : cases.y) : cases.z;

		// Avoids ατ == 0. Could also do ατ =1-ατ
  return clamp(threshold, 1.0e-6f, 1.0f);

}

#endif

#ifdef USE_AOMAP

uniform sampler2D aoMap;
uniform float aoMapIntensity;

#endif

#ifdef USE_LIGHTMAP

uniform sampler2D lightMap;
uniform float lightMapIntensity;

#endif

#ifdef USE_EMISSIVEMAP

uniform sampler2D emissiveMap;

#endif

#ifdef USE_ENVMAP

uniform float envMapIntensity;
uniform float flipEnvMap;

	#ifdef ENVMAP_TYPE_CUBE
uniform samplerCube envMap;
	#else
uniform sampler2D envMap;
	#endif

#endif

#ifdef USE_ENVMAP

uniform float reflectivity;

	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )

		#define ENV_WORLDPOS

	#endif

	#ifdef ENV_WORLDPOS

varying vec3 vWorldPosition;
uniform float refractionRatio;
	#else
varying vec3 vReflect;
	#endif

#endif

#ifdef USE_FOG

uniform vec3 fogColor;
varying float vFogDepth;

	#ifdef FOG_EXP2

uniform float fogDensity;

	#else

uniform float fogNear;
uniform float fogFar;

	#endif

#endif

float G_BlinnPhong_Implicit( /* const in float dotNL, const in float dotNV */ ) {

	// geometry term is (n dot l)(n dot v) / 4(n dot l)(n dot v)
  return 0.25f;

}

float D_BlinnPhong(const in float shininess, const in float dotNH) {

  return RECIPROCAL_PI * (shininess * 0.5f + 1.0f) * pow(dotNH, shininess);

}

vec3 BRDF_BlinnPhong(const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess) {

  vec3 halfDir = normalize(lightDir + viewDir);

  float dotNH = saturate(dot(normal, halfDir));
  float dotVH = saturate(dot(viewDir, halfDir));

  vec3 F = F_Schlick(specularColor, 1.0f, dotVH);

  float G = G_BlinnPhong_Implicit( /* dotNL, dotNV */ );

  float D = D_BlinnPhong(shininess, dotNH);

  return F * (G * D);

} // validated

uniform bool receiveShadow;
uniform vec3 ambientLightColor;

#if defined( USE_LIGHT_PROBES )

uniform vec3 lightProbe[9];

#endif

// get the irradiance (radiance convolved with cosine lobe) at the point 'normal' on the unit sphere
// source: https://graphics.stanford.edu/papers/envmap/envmap.pdf
vec3 shGetIrradianceAt(in vec3 normal, in vec3 shCoefficients[9]) {

	// normal is assumed to have unit length

  float x = normal.x, y = normal.y, z = normal.z;

	// band 0
  vec3 result = shCoefficients[0] * 0.886227f;

	// band 1
  result += shCoefficients[1] * 2.0f * 0.511664f * y;
  result += shCoefficients[2] * 2.0f * 0.511664f * z;
  result += shCoefficients[3] * 2.0f * 0.511664f * x;

	// band 2
  result += shCoefficients[4] * 2.0f * 0.429043f * x * y;
  result += shCoefficients[5] * 2.0f * 0.429043f * y * z;
  result += shCoefficients[6] * (0.743125f * z * z - 0.247708f);
  result += shCoefficients[7] * 2.0f * 0.429043f * x * z;
  result += shCoefficients[8] * 0.429043f * (x * x - y * y);

  return result;

}

vec3 getLightProbeIrradiance(const in vec3 lightProbe[9], const in vec3 normal) {

  vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);

  vec3 irradiance = shGetIrradianceAt(worldNormal, lightProbe);

  return irradiance;

}

vec3 getAmbientLightIrradiance(const in vec3 ambientLightColor) {

  vec3 irradiance = ambientLightColor;

  return irradiance;

}

float getDistanceAttenuation(const in float lightDistance, const in float cutoffDistance, const in float decayExponent) {

	#if defined ( LEGACY_LIGHTS )

  if(cutoffDistance > 0.0f && decayExponent > 0.0f) {

    return pow(saturate(-lightDistance / cutoffDistance + 1.0f), decayExponent);

  }

  return 1.0f;

	#else

		// based upon Frostbite 3 Moving to Physically-based Rendering
		// page 32, equation 26: E[window1]
		// https://seblagarde.files.wordpress.com/2015/07/course_notes_moving_frostbite_to_pbr_v32.pdf
  float distanceFalloff = 1.0f / max(pow(lightDistance, decayExponent), 0.01f);

  if(cutoffDistance > 0.0f) {

    distanceFalloff *= pow2(saturate(1.0f - pow4(lightDistance / cutoffDistance)));

  }

  return distanceFalloff;

	#endif

}

float getSpotAttenuation(const in float coneCosine, const in float penumbraCosine, const in float angleCosine) {

  return smoothstep(coneCosine, penumbraCosine, angleCosine);

}

#if 0 > 0

struct DirectionalLight {
  vec3 direction;
  vec3 color;
};

uniform DirectionalLight directionalLights[0];

void getDirectionalLightInfo(const in DirectionalLight directionalLight, out IncidentLight light) {

  light.color = directionalLight.color;
  light.direction = directionalLight.direction;
  light.visible = true;

}

#endif

#if 0 > 0

struct PointLight {
  vec3 position;
  vec3 color;
  float distance;
  float decay;
};

uniform PointLight pointLights[0];

	// light is an out parameter as having it as a return value caused compiler errors on some devices
void getPointLightInfo(const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light) {

  vec3 lVector = pointLight.position - geometryPosition;

  light.direction = normalize(lVector);

  float lightDistance = length(lVector);

  light.color = pointLight.color;
  light.color *= getDistanceAttenuation(lightDistance, pointLight.distance, pointLight.decay);
  light.visible = (light.color != vec3(0.0f));

}

#endif

#if 0 > 0

struct SpotLight {
  vec3 position;
  vec3 direction;
  vec3 color;
  float distance;
  float decay;
  float coneCos;
  float penumbraCos;
};

uniform SpotLight spotLights[0];

	// light is an out parameter as having it as a return value caused compiler errors on some devices
void getSpotLightInfo(const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light) {

  vec3 lVector = spotLight.position - geometryPosition;

  light.direction = normalize(lVector);

  float angleCos = dot(light.direction, spotLight.direction);

  float spotAttenuation = getSpotAttenuation(spotLight.coneCos, spotLight.penumbraCos, angleCos);

  if(spotAttenuation > 0.0f) {

    float lightDistance = length(lVector);

    light.color = spotLight.color * spotAttenuation;
    light.color *= getDistanceAttenuation(lightDistance, spotLight.distance, spotLight.decay);
    light.visible = (light.color != vec3(0.0f));

  } else {

    light.color = vec3(0.0f);
    light.visible = false;

  }

}

#endif

#if 0 > 0

struct RectAreaLight {
  vec3 color;
  vec3 position;
  vec3 halfWidth;
  vec3 halfHeight;
};

	// Pre-computed values of LinearTransformedCosine approximation of BRDF
	// BRDF approximation Texture is 64x64
uniform sampler2D ltc_1; // RGBA Float
uniform sampler2D ltc_2; // RGBA Float

uniform RectAreaLight rectAreaLights[0];

#endif

#if 0 > 0

struct HemisphereLight {
  vec3 direction;
  vec3 skyColor;
  vec3 groundColor;
};

uniform HemisphereLight hemisphereLights[0];

vec3 getHemisphereLightIrradiance(const in HemisphereLight hemiLight, const in vec3 normal) {

  float dotNL = dot(normal, hemiLight.direction);
  float hemiDiffuseWeight = 0.5f * dotNL + 0.5f;

  vec3 irradiance = mix(hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight);

  return irradiance;

}

#endif

#ifndef FLAT_SHADED

varying vec3 vNormal;

	#ifdef USE_TANGENT

varying vec3 vTangent;
varying vec3 vBitangent;

	#endif

#endif

varying vec3 vViewPosition;

struct BlinnPhongMaterial {

  vec3 diffuseColor;
  vec3 specularColor;
  float specularShininess;
  float specularStrength;

};

void RE_Direct_BlinnPhong(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight) {

  float dotNL = saturate(dot(geometryNormal, directLight.direction));
  vec3 irradiance = dotNL * directLight.color;

  reflectedLight.directDiffuse += irradiance * BRDF_Lambert(material.diffuseColor);

  reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong(directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess) * material.specularStrength;

}

void RE_IndirectDiffuse_BlinnPhong(const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight) {

  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert(material.diffuseColor);

}

#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong

#if 0 > 0

varying vec4 vSpotLightCoord[0];

#endif

#if 0 > 0

uniform sampler2D spotLightMap[0];

#endif

#ifdef USE_SHADOWMAP

	#if 0 > 0

uniform sampler2D directionalShadowMap[0];
varying vec4 vDirectionalShadowCoord[0];

struct DirectionalLightShadow {
  float shadowBias;
  float shadowNormalBias;
  float shadowRadius;
  vec2 shadowMapSize;
};

uniform DirectionalLightShadow directionalLightShadows[0];

	#endif

	#if 0 > 0

uniform sampler2D spotShadowMap[0];

struct SpotLightShadow {
  float shadowBias;
  float shadowNormalBias;
  float shadowRadius;
  vec2 shadowMapSize;
};

uniform SpotLightShadow spotLightShadows[0];

	#endif

	#if 0 > 0

uniform sampler2D pointShadowMap[0];
varying vec4 vPointShadowCoord[0];

struct PointLightShadow {
  float shadowBias;
  float shadowNormalBias;
  float shadowRadius;
  vec2 shadowMapSize;
  float shadowCameraNear;
  float shadowCameraFar;
};

uniform PointLightShadow pointLightShadows[0];

	#endif

	/*
	#if 0 > 0

		// TODO (abelnation): create uniforms for area light shadows

	#endif
	*/

float texture2DCompare(sampler2D depths, vec2 uv, float compare) {

  return step(compare, unpackRGBAToDepth(texture2D(depths, uv)));

}

vec2 texture2DDistribution(sampler2D shadow, vec2 uv) {

  return unpackRGBATo2Half(texture2D(shadow, uv));

}

float VSMShadow(sampler2D shadow, vec2 uv, float compare) {

  float occlusion = 1.0f;

  vec2 distribution = texture2DDistribution(shadow, uv);

  float hard_shadow = step(compare, distribution.x); // Hard Shadow

  if(hard_shadow != 1.0f) {

    float distance = compare - distribution.x;
    float variance = max(0.00000f, distribution.y * distribution.y);
    float softness_probability = variance / (variance + distance * distance); // Chebeyshevs inequality
    softness_probability = clamp((softness_probability - 0.3f) / (0.95f - 0.3f), 0.0f, 1.0f); // 0.3 reduces light bleed
    occlusion = clamp(max(hard_shadow, softness_probability), 0.0f, 1.0f);

  }
  return occlusion;

}

float getShadow(sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord) {

  float shadow = 1.0f;

  shadowCoord.xyz /= shadowCoord.w;
  shadowCoord.z += shadowBias;

  bool inFrustum = shadowCoord.x >= 0.0f && shadowCoord.x <= 1.0f && shadowCoord.y >= 0.0f && shadowCoord.y <= 1.0f;
  bool frustumTest = inFrustum && shadowCoord.z <= 1.0f;

  if(frustumTest) {

		#if defined( SHADOWMAP_TYPE_PCF )

    vec2 texelSize = vec2(1.0f) / shadowMapSize;

    float dx0 = -texelSize.x * shadowRadius;
    float dy0 = -texelSize.y * shadowRadius;
    float dx1 = +texelSize.x * shadowRadius;
    float dy1 = +texelSize.y * shadowRadius;
    float dx2 = dx0 / 2.0f;
    float dy2 = dy0 / 2.0f;
    float dx3 = dx1 / 2.0f;
    float dy3 = dy1 / 2.0f;

    shadow = (texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx0, dy0), shadowCoord.z) +
      texture2DCompare(shadowMap, shadowCoord.xy + vec2(0.0f, dy0), shadowCoord.z) +
      texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx1, dy0), shadowCoord.z) +
      texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx2, dy2), shadowCoord.z) +
      texture2DCompare(shadowMap, shadowCoord.xy + vec2(0.0f, dy2), shadowCoord.z) +
      texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx3, dy2), shadowCoord.z) +
      texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx0, 0.0f), shadowCoord.z) +
      texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx2, 0.0f), shadowCoord.z) +
      texture2DCompare(shadowMap, shadowCoord.xy, shadowCoord.z) +
      texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx3, 0.0f), shadowCoord.z) +
      texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx1, 0.0f), shadowCoord.z) +
      texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx2, dy3), shadowCoord.z) +
      texture2DCompare(shadowMap, shadowCoord.xy + vec2(0.0f, dy3), shadowCoord.z) +
      texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx3, dy3), shadowCoord.z) +
      texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx0, dy1), shadowCoord.z) +
      texture2DCompare(shadowMap, shadowCoord.xy + vec2(0.0f, dy1), shadowCoord.z) +
      texture2DCompare(shadowMap, shadowCoord.xy + vec2(dx1, dy1), shadowCoord.z)) * (1.0f / 17.0f);

		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )

    vec2 texelSize = vec2(1.0f) / shadowMapSize;
    float dx = texelSize.x;
    float dy = texelSize.y;

    vec2 uv = shadowCoord.xy;
    vec2 f = fract(uv * shadowMapSize + 0.5f);
    uv -= f * texelSize;

    shadow = (texture2DCompare(shadowMap, uv, shadowCoord.z) +
      texture2DCompare(shadowMap, uv + vec2(dx, 0.0f), shadowCoord.z) +
      texture2DCompare(shadowMap, uv + vec2(0.0f, dy), shadowCoord.z) +
      texture2DCompare(shadowMap, uv + texelSize, shadowCoord.z) +
      mix(texture2DCompare(shadowMap, uv + vec2(-dx, 0.0f), shadowCoord.z), texture2DCompare(shadowMap, uv + vec2(2.0f * dx, 0.0f), shadowCoord.z), f.x) +
      mix(texture2DCompare(shadowMap, uv + vec2(-dx, dy), shadowCoord.z), texture2DCompare(shadowMap, uv + vec2(2.0f * dx, dy), shadowCoord.z), f.x) +
      mix(texture2DCompare(shadowMap, uv + vec2(0.0f, -dy), shadowCoord.z), texture2DCompare(shadowMap, uv + vec2(0.0f, 2.0f * dy), shadowCoord.z), f.y) +
      mix(texture2DCompare(shadowMap, uv + vec2(dx, -dy), shadowCoord.z), texture2DCompare(shadowMap, uv + vec2(dx, 2.0f * dy), shadowCoord.z), f.y) +
      mix(mix(texture2DCompare(shadowMap, uv + vec2(-dx, -dy), shadowCoord.z), texture2DCompare(shadowMap, uv + vec2(2.0f * dx, -dy), shadowCoord.z), f.x), mix(texture2DCompare(shadowMap, uv + vec2(-dx, 2.0f * dy), shadowCoord.z), texture2DCompare(shadowMap, uv + vec2(2.0f * dx, 2.0f * dy), shadowCoord.z), f.x), f.y)) * (1.0f / 9.0f);

		#elif defined( SHADOWMAP_TYPE_VSM )

    shadow = VSMShadow(shadowMap, shadowCoord.xy, shadowCoord.z);

		#else // no percentage-closer filtering:

    shadow = texture2DCompare(shadowMap, shadowCoord.xy, shadowCoord.z);

		#endif

  }

  return shadow;

}

	// cubeToUV() maps a 3D direction vector suitable for cube texture mapping to a 2D
	// vector suitable for 2D texture mapping. This code uses the following layout for the
	// 2D texture:
	//
	// xzXZ
	//  y Y
	//
	// Y - Positive y direction
	// y - Negative y direction
	// X - Positive x direction
	// x - Negative x direction
	// Z - Positive z direction
	// z - Negative z direction
	//
	// Source and test bed:
	// https://gist.github.com/tschw/da10c43c467ce8afd0c4

vec2 cubeToUV(vec3 v, float texelSizeY) {

		// Number of texels to avoid at the edge of each square

  vec3 absV = abs(v);

		// Intersect unit cube

  float scaleToCube = 1.0f / max(absV.x, max(absV.y, absV.z));
  absV *= scaleToCube;

		// Apply scale to avoid seams

		// two texels less per square (one texel will do for NEAREST)
  v *= scaleToCube * (1.0f - 2.0f * texelSizeY);

		// Unwrap

		// space: -1 ... 1 range for each square
		//
		// #X##		dim    := ( 4 , 2 )
		//  # #		center := ( 1 , 1 )

  vec2 planar = v.xy;

  float almostATexel = 1.5f * texelSizeY;
  float almostOne = 1.0f - almostATexel;

  if(absV.z >= almostOne) {

    if(v.z > 0.0f)
      planar.x = 4.0f - v.x;

  } else if(absV.x >= almostOne) {

    float signX = sign(v.x);
    planar.x = v.z * signX + 2.0f * signX;

  } else if(absV.y >= almostOne) {

    float signY = sign(v.y);
    planar.x = v.x + 2.0f * signY + 2.0f;
    planar.y = v.z * signY - 2.0f;

  }

		// Transform to UV space

		// scale := 0.5 / dim
		// translate := ( center + 0.5 ) / dim
  return vec2(0.125f, 0.25f) * planar + vec2(0.375f, 0.75f);

}

float getPointShadow(sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar) {

  vec2 texelSize = vec2(1.0f) / (shadowMapSize * vec2(4.0f, 2.0f));

		// for point lights, the uniform @vShadowCoord is re-purposed to hold
		// the vector from the light to the world-space position of the fragment.
  vec3 lightToPosition = shadowCoord.xyz;

		// dp = normalized distance from light to fragment position
  float dp = (length(lightToPosition) - shadowCameraNear) / (shadowCameraFar - shadowCameraNear); // need to clamp?
  dp += shadowBias;

		// bd3D = base direction 3D
  vec3 bd3D = normalize(lightToPosition);

		#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )

  vec2 offset = vec2(-1, 1) * shadowRadius * texelSize.y;

  return (texture2DCompare(shadowMap, cubeToUV(bd3D + offset.xyy, texelSize.y), dp) +
    texture2DCompare(shadowMap, cubeToUV(bd3D + offset.yyy, texelSize.y), dp) +
    texture2DCompare(shadowMap, cubeToUV(bd3D + offset.xyx, texelSize.y), dp) +
    texture2DCompare(shadowMap, cubeToUV(bd3D + offset.yyx, texelSize.y), dp) +
    texture2DCompare(shadowMap, cubeToUV(bd3D, texelSize.y), dp) +
    texture2DCompare(shadowMap, cubeToUV(bd3D + offset.xxy, texelSize.y), dp) +
    texture2DCompare(shadowMap, cubeToUV(bd3D + offset.yxy, texelSize.y), dp) +
    texture2DCompare(shadowMap, cubeToUV(bd3D + offset.xxx, texelSize.y), dp) +
    texture2DCompare(shadowMap, cubeToUV(bd3D + offset.yxx, texelSize.y), dp)) * (1.0f / 9.0f);

		#else // no percentage-closer filtering

  return texture2DCompare(shadowMap, cubeToUV(bd3D, texelSize.y), dp);

		#endif

}

#endif

#ifdef USE_BUMPMAP

uniform sampler2D bumpMap;
uniform float bumpScale;

	// Bump Mapping Unparametrized Surfaces on the GPU by Morten S. Mikkelsen
	// https://mmikk.github.io/papers3d/mm_sfgrad_bump.pdf

	// Evaluate the derivative of the height w.r.t. screen-space using forward differencing (listing 2)

vec2 dHdxy_fwd() {

  vec2 dSTdx = dFdx(vBumpMapUv);
  vec2 dSTdy = dFdy(vBumpMapUv);

  float Hll = bumpScale * texture2D(bumpMap, vBumpMapUv).x;
  float dBx = bumpScale * texture2D(bumpMap, vBumpMapUv + dSTdx).x - Hll;
  float dBy = bumpScale * texture2D(bumpMap, vBumpMapUv + dSTdy).x - Hll;

  return vec2(dBx, dBy);

}

vec3 perturbNormalArb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {

		// normalize is done to ensure that the bump map looks the same regardless of the texture's scale
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
  vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 vN = surf_norm; // normalized

  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);

  float fDet = dot(vSigmaX, R1) * faceDirection;

  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);

}

#endif

#ifdef USE_NORMALMAP

uniform sampler2D normalMap;
uniform vec2 normalScale;

#endif

#ifdef USE_NORMALMAP_OBJECTSPACE

uniform mat3 normalMatrix;

#endif

#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )

	// Normal Mapping Without Precomputed Tangents
	// http://www.thetenthplanet.de/archives/1180

mat3 getTangentFrame(vec3 eye_pos, vec3 surf_norm, vec2 uv) {

  vec3 q0 = dFdx(eye_pos.xyz);
  vec3 q1 = dFdy(eye_pos.xyz);
  vec2 st0 = dFdx(uv.st);
  vec2 st1 = dFdy(uv.st);

  vec3 N = surf_norm; // normalized

  vec3 q1perp = cross(q1, N);
  vec3 q0perp = cross(N, q0);

  vec3 T = q1perp * st0.x + q0perp * st1.x;
  vec3 B = q1perp * st0.y + q0perp * st1.y;

  float det = max(dot(T, T), dot(B, B));
  float scale = (det == 0.0f) ? 0.0f : inversesqrt(det);

  return mat3(T * scale, B * scale, N);

}

#endif

#ifdef USE_SPECULARMAP

uniform sampler2D specularMap;

#endif

#if defined( USE_LOGDEPTHBUF ) && defined( USE_LOGDEPTHBUF_EXT )

uniform float logDepthBufFC;
varying float vFragDepth;
varying float vIsPerspective;

#endif

#if 0 > 0

varying vec3 vClipPosition;

uniform vec4 clippingPlanes[0];

#endif

void main() {

  vec4 diffuseColor = vec4(diffuse, opacity);

#if 0 > 0

  vec4 plane;

	#ifdef ALPHA_TO_COVERAGE

  float distanceToPlane, distanceGradient;
  float clipOpacity = 1.0f;

		#if 0 < 0

  float unionClipOpacity = 1.0f;

  clipOpacity *= 1.0f - unionClipOpacity;

		#endif

  diffuseColor.a *= clipOpacity;

  if(diffuseColor.a == 0.0f)
    discard;

	#else

		#if 0 < 0

  bool clipped = true;

  if(clipped)
    discard;

		#endif

	#endif

#endif

  ReflectedLight reflectedLight = ReflectedLight(vec3(0.0f), vec3(0.0f), vec3(0.0f), vec3(0.0f));
  vec3 totalEmissiveRadiance = emissive;

#if defined( USE_LOGDEPTHBUF ) && defined( USE_LOGDEPTHBUF_EXT )

	// Doing a strict comparison with == 1.0 can cause noise artifacts
	// on some platforms. See issue #17623.
  gl_FragDepthEXT = vIsPerspective == 0.0f ? gl_FragCoord.z : log2(vFragDepth) * logDepthBufFC * 0.5f;

#endif

#ifdef USE_MAP

  vec4 sampledDiffuseColor = texture2D(map, vMapUv);

	#ifdef DECODE_VIDEO_TEXTURE

		// use inline sRGB decode until browsers properly support SRGB8_APLHA8 with video textures

  sampledDiffuseColor = vec4(mix(pow(sampledDiffuseColor.rgb * 0.9478672986f + vec3(0.0521327014f), vec3(2.4f)), sampledDiffuseColor.rgb * 0.0773993808f, vec3(lessThanEqual(sampledDiffuseColor.rgb, vec3(0.04045f)))), sampledDiffuseColor.w);

	#endif

  diffuseColor *= sampledDiffuseColor;

#endif

#if defined( USE_COLOR_ALPHA )

  diffuseColor *= vColor;

#elif defined( USE_COLOR )

  diffuseColor.rgb *= vColor;

#endif

#ifdef USE_ALPHAMAP

  diffuseColor.a *= texture2D(alphaMap, vAlphaMapUv).g;

#endif

#ifdef USE_ALPHATEST

	#ifdef ALPHA_TO_COVERAGE

  diffuseColor.a = smoothstep(alphaTest, alphaTest + fwidth(diffuseColor.a), diffuseColor.a);
  if(diffuseColor.a == 0.0f)
    discard;

	#else

  if(diffuseColor.a < alphaTest)
    discard;

	#endif

#endif

#ifdef USE_ALPHAHASH

  if(diffuseColor.a < getAlphaHashThreshold(vPosition))
    discard;

#endif

  float specularStrength;

#ifdef USE_SPECULARMAP

  vec4 texelSpecular = texture2D(specularMap, vSpecularMapUv);
  specularStrength = texelSpecular.r;

#else

  specularStrength = 1.0f;

#endif

  float faceDirection = gl_FrontFacing ? 1.0f : -1.0f;

#ifdef FLAT_SHADED

  vec3 fdx = dFdx(vViewPosition);
  vec3 fdy = dFdy(vViewPosition);
  vec3 normal = normalize(cross(fdx, fdy));

#else

  vec3 normal = normalize(vNormal);

	#ifdef DOUBLE_SIDED

  normal *= faceDirection;

	#endif

#endif

#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )

	#ifdef USE_TANGENT

  mat3 tbn = mat3(normalize(vTangent), normalize(vBitangent), normal);

	#else

  mat3 tbn = getTangentFrame(-vViewPosition, normal,
		#if defined( USE_NORMALMAP )
  vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
  vClearcoatNormalMapUv
		#else
  vUv
		#endif
  );

	#endif

	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )

  tbn[0] *= faceDirection;
  tbn[1] *= faceDirection;

	#endif

#endif

#ifdef USE_CLEARCOAT_NORMALMAP

	#ifdef USE_TANGENT

  mat3 tbn2 = mat3(normalize(vTangent), normalize(vBitangent), normal);

	#else

  mat3 tbn2 = getTangentFrame(-vViewPosition, normal, vClearcoatNormalMapUv);

	#endif

	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )

  tbn2[0] *= faceDirection;
  tbn2[1] *= faceDirection;

	#endif

#endif

// non perturbed normal for clearcoat among others

  vec3 nonPerturbedNormal = normal;

#ifdef USE_NORMALMAP_OBJECTSPACE

  normal = texture2D(normalMap, vNormalMapUv).xyz * 2.0f - 1.0f; // overrides both flatShading and attribute normals

	#ifdef FLIP_SIDED

  normal = -normal;

	#endif

	#ifdef DOUBLE_SIDED

  normal = normal * faceDirection;

	#endif

  normal = normalize(normalMatrix * normal);

#elif defined( USE_NORMALMAP_TANGENTSPACE )

  vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0f - 1.0f;
  mapN.xy *= normalScale;

  normal = normalize(tbn * mapN);

#elif defined( USE_BUMPMAP )

  normal = perturbNormalArb(-vViewPosition, normal, dHdxy_fwd(), faceDirection);

#endif

#ifdef USE_EMISSIVEMAP

  vec4 emissiveColor = texture2D(emissiveMap, vEmissiveMapUv);

  totalEmissiveRadiance *= emissiveColor.rgb;

#endif

	// accumulation

  BlinnPhongMaterial material;
  material.diffuseColor = diffuseColor.rgb;
  material.specularColor = specular;
  material.specularShininess = shininess;
  material.specularStrength = specularStrength;

/**
 * This is a template that can be used to light a material, it uses pluggable
 * RenderEquations (RE)for specific lighting scenarios.
 *
 * Instructions for use:
 * - Ensure that both RE_Direct, RE_IndirectDiffuse and RE_IndirectSpecular are defined
 * - Create a material parameter that is to be passed as the third parameter to your lighting functions.
 *
 * TODO:
 * - Add area light support.
 * - Add sphere light support.
 * - Add diffuse light probe (irradiance cubemap) support.
 */

  vec3 geometryPosition = -vViewPosition;
  vec3 geometryNormal = normal;
  vec3 geometryViewDir = (isOrthographic) ? vec3(0, 0, 1) : normalize(vViewPosition);

  vec3 geometryClearcoatNormal = vec3(0.0f);

#ifdef USE_CLEARCOAT

  geometryClearcoatNormal = clearcoatNormal;

#endif

#ifdef USE_IRIDESCENCE

  float dotNVi = saturate(dot(normal, geometryViewDir));

  if(material.iridescenceThickness == 0.0f) {

    material.iridescence = 0.0f;

  } else {

    material.iridescence = saturate(material.iridescence);

  }

  if(material.iridescence > 0.0f) {

    material.iridescenceFresnel = evalIridescence(1.0f, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor);

		// Iridescence F0 approximation
    material.iridescenceF0 = Schlick_to_F0(material.iridescenceFresnel, 1.0f, dotNVi);

  }

#endif

  IncidentLight directLight;

#if ( 0 > 0 ) && defined( RE_Direct )

  PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && 0 > 0
  PointLightShadow pointLightShadow;
	#endif

#endif

#if ( 0 > 0 ) && defined( RE_Direct )

  SpotLight spotLight;
  vec4 spotColor;
  vec3 spotLightCoord;
  bool inSpotLightMap;

	#if defined( USE_SHADOWMAP ) && 0 > 0
  SpotLightShadow spotLightShadow;
	#endif

#endif

#if ( 0 > 0 ) && defined( RE_Direct )

  DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && 0 > 0
  DirectionalLightShadow directionalLightShadow;
	#endif

#endif

#if ( 0 > 0 ) && defined( RE_Direct_RectArea )

  RectAreaLight rectAreaLight;

#endif

#if defined( RE_IndirectDiffuse )

  vec3 iblIrradiance = vec3(0.0f);

  vec3 irradiance = getAmbientLightIrradiance(ambientLightColor);

	#if defined( USE_LIGHT_PROBES )

  irradiance += getLightProbeIrradiance(lightProbe, geometryNormal);

	#endif

	#if ( 0 > 0 )

	#endif

#endif

#if defined( RE_IndirectSpecular )

  vec3 radiance = vec3(0.0f);
  vec3 clearcoatRadiance = vec3(0.0f);

#endif

#if defined( RE_IndirectDiffuse )

	#ifdef USE_LIGHTMAP

  vec4 lightMapTexel = texture2D(lightMap, vLightMapUv);
  vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;

  irradiance += lightMapIrradiance;

	#endif

	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )

  iblIrradiance += getIBLIrradiance(geometryNormal);

	#endif

#endif

#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )

	#ifdef USE_ANISOTROPY

  radiance += getIBLAnisotropyRadiance(geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy);

	#else

  radiance += getIBLRadiance(geometryViewDir, geometryNormal, material.roughness);

	#endif

	#ifdef USE_CLEARCOAT

  clearcoatRadiance += getIBLRadiance(geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness);

	#endif

#endif

#if defined( RE_IndirectDiffuse )

  RE_IndirectDiffuse(irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);

#endif

#if defined( RE_IndirectSpecular )

  RE_IndirectSpecular(radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);

#endif

	// modulation

#ifdef USE_AOMAP

	// reads channel R, compatible with a combined OcclusionRoughnessMetallic (RGB) texture
  float ambientOcclusion = (texture2D(aoMap, vAoMapUv).r - 1.0f) * aoMapIntensity + 1.0f;

  reflectedLight.indirectDiffuse *= ambientOcclusion;

	#if defined( USE_CLEARCOAT ) 
  clearcoatSpecularIndirect *= ambientOcclusion;
	#endif

	#if defined( USE_SHEEN ) 
  sheenSpecularIndirect *= ambientOcclusion;
	#endif

	#if defined( USE_ENVMAP ) && defined( STANDARD )

  float dotNV = saturate(dot(geometryNormal, geometryViewDir));

  reflectedLight.indirectSpecular *= computeSpecularOcclusion(dotNV, ambientOcclusion, material.roughness);

	#endif

#endif

  // 出去的光 = 反射光的直接漫反射 + 反射光的间接漫反射 + 反射光的直接高光 + 反射光的间接高光 + 总辐射能量
  vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;

#ifdef USE_ENVMAP

	#ifdef ENV_WORLDPOS

  vec3 cameraToFrag;

  if(isOrthographic) {

    cameraToFrag = normalize(vec3(-viewMatrix[0][2], -viewMatrix[1][2], -viewMatrix[2][2]));

  } else {

    cameraToFrag = normalize(vWorldPosition - cameraPosition);

  }

		// Transforming Normal Vectors with the Inverse Transformation
  vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);

		#ifdef ENVMAP_MODE_REFLECTION

  vec3 reflectVec = reflect(cameraToFrag, worldNormal);

		#else

  vec3 reflectVec = refract(cameraToFrag, worldNormal, refractionRatio);

		#endif

	#else

  vec3 reflectVec = vReflect;

	#endif

	#ifdef ENVMAP_TYPE_CUBE

  vec4 envColor = textureCube(envMap, vec3(flipEnvMap * reflectVec.x, reflectVec.yz));

	#else

  vec4 envColor = vec4(0.0f);

	#endif

	#ifdef ENVMAP_BLENDING_MULTIPLY

  outgoingLight = mix(outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity);

	#elif defined( ENVMAP_BLENDING_MIX )

  outgoingLight = mix(outgoingLight, envColor.xyz, specularStrength * reflectivity);

	#elif defined( ENVMAP_BLENDING_ADD )

  outgoingLight += envColor.xyz * specularStrength * reflectivity;

	#endif

#endif

#ifdef OPAQUE
  diffuseColor.a = 1.0f;
#endif

#ifdef USE_TRANSMISSION
  diffuseColor.a *= material.transmissionAlpha;
#endif

  gl_FragColor = vec4(outgoingLight, diffuseColor.a);

#if defined( TONE_MAPPING )

  gl_FragColor.rgb = toneMapping(gl_FragColor.rgb);

#endif

  gl_FragColor = linearToOutputTexel(gl_FragColor);

#ifdef USE_FOG

	#ifdef FOG_EXP2

  float fogFactor = 1.0f - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);

	#else

  float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);

	#endif

  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);

#endif

#ifdef PREMULTIPLIED_ALPHA

	// Get get normal blending with premultipled, use with CustomBlending, OneFactor, OneMinusSrcAlphaFactor, AddEquation.
  gl_FragColor.rgb *= gl_FragColor.a;

#endif

#ifdef DITHERING

  gl_FragColor.rgb = dithering(gl_FragColor.rgb);

#endif

}
