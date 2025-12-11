"""Exporter configuration endpoints."""

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request

router = APIRouter(prefix="/api/exporters", tags=["exporters"])


def get_exporter_manager(request: Request):
    """Get exporter manager from app state."""
    return request.app.state.exporter_manager


@router.get("")
async def list_exporters(
    request: Request,
) -> List[Dict[str, Any]]:
    """List all exporters with their status."""
    manager = request.app.state.exporter_manager
    return manager.list()


@router.get("/{name}")
async def get_exporter(
    name: str,
    request: Request,
) -> Dict[str, Any]:
    """Get exporter information."""
    manager = request.app.state.exporter_manager
    exporter = manager.get(name)
    if not exporter:
        raise HTTPException(status_code=404, detail=f"Exporter '{name}' not found")
    return exporter.get_info()


@router.get("/{name}/schema")
async def get_exporter_schema(
    name: str,
    request: Request,
) -> Dict[str, Any]:
    """Get configuration schema for an exporter."""
    manager = request.app.state.exporter_manager
    exporter = manager.get(name)
    if not exporter:
        raise HTTPException(status_code=404, detail=f"Exporter '{name}' not found")
    return exporter.get_config_schema()


@router.post("/{name}/test")
async def test_exporter(
    name: str,
    request: Request,
) -> Dict[str, Any]:
    """Test an exporter's connection."""
    manager = request.app.state.exporter_manager
    return await manager.test_exporter(name)


@router.put("/{name}/config")
async def update_exporter_config(
    name: str,
    config: Dict[str, Any],
    request: Request,
) -> Dict[str, Any]:
    """Update an exporter's configuration."""
    manager = request.app.state.exporter_manager
    try:
        await manager.update_config(name, config)
        return {"success": True, "message": "Configuration updated"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{name}/start")
async def start_exporter(
    name: str,
    request: Request,
) -> Dict[str, Any]:
    """Start an exporter."""
    manager = request.app.state.exporter_manager
    exporter = manager.get(name)
    if not exporter:
        raise HTTPException(status_code=404, detail=f"Exporter '{name}' not found")

    try:
        await exporter.connect()
        return {"success": True, "status": exporter.status}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{name}/stop")
async def stop_exporter(
    name: str,
    request: Request,
) -> Dict[str, Any]:
    """Stop an exporter."""
    manager = request.app.state.exporter_manager
    exporter = manager.get(name)
    if not exporter:
        raise HTTPException(status_code=404, detail=f"Exporter '{name}' not found")

    await exporter.disconnect()
    return {"success": True, "status": exporter.status}


@router.post("/reload")
async def reload_exporters(
    request: Request,
) -> Dict[str, Any]:
    """Reload all exporters (hot reload).

    Useful for detecting new exporters added without restart.
    """
    manager = request.app.state.exporter_manager
    result = await manager.reload()
    return {
        "success": True,
        "added": result["added"],
        "removed": result["removed"],
        "reloaded": result["reloaded"],
        "total": len(manager.list()),
    }


@router.get("/schemas/all")
async def get_all_schemas(
    request: Request,
) -> Dict[str, Dict[str, Any]]:
    """Get configuration schemas for all exporters."""
    manager = request.app.state.exporter_manager
    return manager.get_config_schemas()
