from typing import Dict
from bson import ObjectId
from fastapi import WebSocket
import logging
from admin.utils.serialize import serialize_document

logger = logging.getLogger(__name__)

async def get_coupons(websocket: WebSocket,db):
    try:
        coupons = await db.find_many("discount_coupons",{})
        if coupons:
            logger.info("coupons data found")
        coupons = serialize_document(coupons)
        await websocket.send_json({
            "type":"coupons_data",
            "data": coupons
        })
    except Exception as e:
        logger.error("coupons not found")
        raise e

async def create_coupons(websocket:WebSocket,coupon_data, db):
    try:
        result = await db.insert_one("discount_coupons",coupon_data)
        if result:
            logger.info("Coupon created")
            coupon_data = serialize_document(coupon_data)
            await websocket.send_json({
                "type": "coupon_created",
                "data":coupon_data
            })
    except Exception as e:
        logger.error("Error creating coupon")
        raise e

async def update_coupon(websocket: WebSocket,data: Dict, db):
    try:
        data["_id"] = ObjectId(data["_id"])
        result = await db.update_one("discount_coupons", {"_id":data['_id']}, data)
        if result:
            logger.info("coupon updated")
        else:
            logger.error("coupon not updates", result)
            raise
        await websocket.send_json({
            "type": "coupon_updated",
            "coupon": serialize_document(data)
        })
    except Exception as e:
        logger.error("Error  updating the coupon")
        raise e

async def delete_coupon(websocket: WebSocket,data: Dict, db):
    try:
        coupon_id = data['_id']
        result = await db.find_one('discount_coupons',{"_id": ObjectId(coupon_id)})
        if result:
            await db.delete_one('discount_coupons', {'_id': ObjectId(coupon_id)})
        await websocket.send_json({
            "type": "coupon_deleted",
            "coupons": serialize_document(result)
        })
    except Exception as e:
        logger.error("Error  deleting the coupon")
        raise e

async def toggle_coupon(websocket: WebSocket,data: Dict, db):
    try:
        coupon_id = data['_id']
        result = await db.find_one('discount_coupons',{"_id": ObjectId(coupon_id)})
        if result:
            await db.update_one('discount_coupons', {'_id': ObjectId(coupon_id)},{'is_active': data['is_active']})
        await websocket.send_json({
            "type": "coupon_updated",
            "coupons": serialize_document(result)
        })
    except Exception as e:
        logger.error("Error  deleting the coupon")
        raise e