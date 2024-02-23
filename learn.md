# renderer.render(scene, camera) 时的核心流程

## 前处理

1. 从上往下更新场景图和相机的世界矩阵和本地矩阵

2. 获取和初始化 currentRenderState 对象

3. 获取和初始化 currentRenderList 对象

4. 从场景树根节点开始调用 projectObject 预处理所有节点，主要是根据节点类型和可见性去添加到 renderState 或者 renderList 上

5. 排序 currentRenderList 对象

## 渲染

1. 设置光源信息

2. 调用 renderScene 渲染场景

3. renderScene 中对三种类型物体列表调用 renderObjects 进行渲染

4. renderObjects 中对每个 object 调用 renderObject 进行渲染

5. 设置物体矩阵信息，然后调用 renderBufferDirect 直接渲染缓冲区

6. renderBufferDirect 中进行了 uniform 变量的设置，然后调用原生的 Webgl draw API 进行绘制

## 后处理

1. 清理渲染过程中的一些绑定全局状态

2. 清理 currentRenderState 对象

3. 清理 currentRenderList 对象
