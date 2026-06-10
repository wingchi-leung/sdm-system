from fastapi import APIRouter
from app.api.v1.endpoints import users, activities, participants, checkins, auth, payments, uploads, roles, tenants, activity_types, community, realname_auth, user_activity_types, notifications

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(activities.router, prefix="/activities", tags=["activities"])
api_router.include_router(participants.router, prefix="/participants", tags=["participants"])
api_router.include_router(checkins.router, prefix="/checkins", tags=["checkins"])
api_router.include_router(payments.router, prefix="/payments", tags=["payments"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
api_router.include_router(roles.router, prefix="/roles", tags=["roles"])
api_router.include_router(tenants.router, prefix="/tenants", tags=["tenants"])
api_router.include_router(activity_types.router, prefix="/activity-types", tags=["activity-types"])
api_router.include_router(community.router, prefix="/community", tags=["community"])
api_router.include_router(realname_auth.router, prefix="/realname-auth", tags=["realname-auth"])
api_router.include_router(user_activity_types.router, prefix="/user-activity-types", tags=["user-activity-types"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
