function painterSortStable( a, b ) {

	if ( a.groupOrder !== b.groupOrder ) {

		return a.groupOrder - b.groupOrder;

	} else if ( a.renderOrder !== b.renderOrder ) {

		return a.renderOrder - b.renderOrder;

	} else if ( a.material.id !== b.material.id ) {

		return a.material.id - b.material.id;

	} else if ( a.z !== b.z ) {

		return a.z - b.z;

	} else {

		return a.id - b.id;

	}

}

function reversePainterSortStable( a, b ) {

	if ( a.groupOrder !== b.groupOrder ) {

		return a.groupOrder - b.groupOrder;

	} else if ( a.renderOrder !== b.renderOrder ) {

		return a.renderOrder - b.renderOrder;

	} else if ( a.z !== b.z ) {

		return b.z - a.z;

	} else {

		return a.id - b.id;

	}

}

// 渲染列表对象，主要存储本次渲染要渲染的不透明物体、透明物体、透射物体三个物体数组以及包含所有物体的数组。
// 渲染时，直接按照处理好的分类。对这些数组进行处理。
function WebGLRenderList() {

  // 保存所有物体的信息列表
	const renderItems = [];
	let renderItemsIndex = 0;

  // 不透明物体列表
	const opaque = [];
  // 透射物体物体列表
	const transmissive = [];
  // 透明物体列表
	const transparent = [];

	function init() {

		renderItemsIndex = 0;

		opaque.length = 0;
		transmissive.length = 0;
		transparent.length = 0;

	}

  // 获取下一个渲染对象
	function getNextRenderItem( object, geometry, material, groupOrder, z, group ) {

		let renderItem = renderItems[ renderItemsIndex ];

		if ( renderItem === undefined ) {

      // renderItems 中不存在则新建一个，并保存渲染对象的信息
			renderItem = {
				id: object.id,
				object: object,
				geometry: geometry,
				material: material,
				groupOrder: groupOrder,
				renderOrder: object.renderOrder,
				z: z,
				group: group
			};

			renderItems[ renderItemsIndex ] = renderItem;

		} else {

      // 存在则更新信息
			renderItem.id = object.id;
			renderItem.object = object;
			renderItem.geometry = geometry;
			renderItem.material = material;
			renderItem.groupOrder = groupOrder;
			renderItem.renderOrder = object.renderOrder;
			renderItem.z = z;
			renderItem.group = group;

		}

		renderItemsIndex ++;

		return renderItem;

	}

	function push( object, geometry, material, groupOrder, z, group ) {

    // 新建一个 renderItem 添加到 renderItems 中
		const renderItem = getNextRenderItem( object, geometry, material, groupOrder, z, group );

    // 根据材质信息添加到对应类别的分组中
		if ( material.transmission > 0.0 ) {

			transmissive.push( renderItem );

		} else if ( material.transparent === true ) {

			transparent.push( renderItem );

		} else {

			opaque.push( renderItem );

		}

	}

  // 这里的 unshift 只有在对应类别的分组是从头添加，renderItems 还是根据 renderItemsIndex 添加
	function unshift( object, geometry, material, groupOrder, z, group ) {

		const renderItem = getNextRenderItem( object, geometry, material, groupOrder, z, group );

		if ( material.transmission > 0.0 ) {

			transmissive.unshift( renderItem );

		} else if ( material.transparent === true ) {

			transparent.unshift( renderItem );

		} else {

			opaque.unshift( renderItem );

		}

	}

  // 对类型列表进行排序，也可以自定义排序方法
	function sort( customOpaqueSort, customTransparentSort ) {

    // 不透明物体默认从近到远渲染
		if ( opaque.length > 1 ) opaque.sort( customOpaqueSort || painterSortStable );
    // 透明物体和透射物体因为需要考虑更深物体的影响，所以从远到近渲染
		if ( transmissive.length > 1 ) transmissive.sort( customTransparentSort || reversePainterSortStable );
		if ( transparent.length > 1 ) transparent.sort( customTransparentSort || reversePainterSortStable );

	}

	function finish() {

		// Clear references from inactive renderItems in the list

    // 从 renderItemsIndex 开始清理到 renderItems.length
		for ( let i = renderItemsIndex, il = renderItems.length; i < il; i ++ ) {

			const renderItem = renderItems[ i ];

			if ( renderItem.id === null ) break;

			renderItem.id = null;
			renderItem.object = null;
			renderItem.geometry = null;
			renderItem.material = null;
			renderItem.group = null;

		}

	}

	return {

		opaque: opaque,
		transmissive: transmissive,
		transparent: transparent,

		init: init,
		push: push,
		unshift: unshift,
		finish: finish,

		sort: sort
	};

}

// 以 scene 为键，使用 weakmap 储存的 renderList 字典对象
function WebGLRenderLists() {

	let lists = new WeakMap();

	function get( scene, renderCallDepth ) {

    // 以 scene 为 key 去获取 renderList 数组
		const listArray = lists.get( scene );
		let list;

		if ( listArray === undefined ) {

      // 没有当前渲染 scene 的 renderList 数组，则初始化一个添加到 lists weakmap 里面
			list = new WebGLRenderList();
      // 注意这里添加的时候是 数组 的形式，也就是说一个 scene 可以有多个 renderList
      // 这里也是为了支持嵌套渲染
			lists.set( scene, [ list ] );

		} else {

			if ( renderCallDepth >= listArray.length ) {

        // 渲染的嵌套层数大于当前已有的列表层数同样需要初始化一个新的 WebGLRenderList 添加进去
				list = new WebGLRenderList();
				listArray.push( list );

			} else {

				list = listArray[ renderCallDepth ];

			}

		}

		return list;

	}

	function dispose() {

		lists = new WeakMap();

	}

	return {
		get: get,
		dispose: dispose
	};

}


export { WebGLRenderLists, WebGLRenderList };
