"""Opportunity route aliases for marketplace tasks."""
from fastapi import APIRouter, Depends

from src.api.routes.auth import require_user
from src.api.routes.marketplace_tasks import (
    TaskApplication,
    TaskApplicationCreate,
    TaskCreate,
    TaskListResponse,
    TaskMatchesResponse,
    TaskResponse,
    TaskSubmission,
    TaskSubmissionCreate,
    TaskUpdate,
    accept_task as _accept_task,
    create_task as _create_task,
    delete_task as _delete_task,
    get_task as _get_task,
    get_task_matches as _get_task_matches,
    list_tasks as _list_tasks,
    submit_task as _submit_task,
    update_task as _update_task,
)

router = APIRouter(prefix="/api/opportunities", tags=["opportunities"])


@router.post("", status_code=201, response_model=TaskResponse)
async def create_opportunity(request: TaskCreate, user: dict = Depends(require_user)):
    return await _create_task(request, user)


@router.get("", response_model=TaskListResponse)
async def list_opportunities(
    user: dict = Depends(require_user),
    limit: int = 50,
    offset: int = 0,
    status: str | None = None,
):
    return await _list_tasks(status=status, limit=limit, offset=offset, user=user)


@router.get("/{opportunity_id}", response_model=TaskResponse)
async def get_opportunity(opportunity_id: str, user: dict = Depends(require_user)):
    return await _get_task(opportunity_id, user)


@router.put("/{opportunity_id}", response_model=TaskResponse)
async def update_opportunity(
    opportunity_id: str,
    request: TaskUpdate,
    user: dict = Depends(require_user),
):
    return await _update_task(opportunity_id, request, user)


@router.delete("/{opportunity_id}", status_code=204)
async def delete_opportunity(opportunity_id: str, user: dict = Depends(require_user)):
    return await _delete_task(opportunity_id, user)


@router.get("/{opportunity_id}/matches", response_model=TaskMatchesResponse)
async def get_opportunity_matches(
    opportunity_id: str,
    user: dict = Depends(require_user),
):
    return await _get_task_matches(opportunity_id, user)


@router.post("/{opportunity_id}/apply", status_code=201, response_model=TaskApplication)
async def apply_opportunity(
    opportunity_id: str,
    request: TaskApplicationCreate,
    user: dict = Depends(require_user),
):
    return await _accept_task(opportunity_id, request, user)


@router.post("/{opportunity_id}/accept", status_code=201, response_model=TaskApplication)
async def accept_opportunity(
    opportunity_id: str,
    request: TaskApplicationCreate,
    user: dict = Depends(require_user),
):
    return await _accept_task(opportunity_id, request, user)


@router.post("/{opportunity_id}/submit", status_code=201, response_model=TaskSubmission)
async def submit_opportunity(
    opportunity_id: str,
    request: TaskSubmissionCreate,
    user: dict = Depends(require_user),
):
    return await _submit_task(opportunity_id, request, user)
