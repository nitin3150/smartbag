from fastapi import WebSocket
import logging
from admin.utils.serialize import serialize_document
from datetime import datetime
from bson import ObjectId
from admin.connection_manager import manager
from admin.config.cloudinary_config import CloudinaryManager
from admin.utils.id_generator import get_id_generator

id_generator = get_id_generator()

logger = logging.getLogger(__name__)

async def send_brands(websocket: WebSocket, db):
    """Send all brands"""
    try:
        brands = await db.find_many("brands", {}, sort=[("name", 1)])
        serialized_brands = [serialize_document(brand) for brand in brands]
        
        await websocket.send_json({
            "type": "brands_data",
            "brands": serialized_brands
        })
    except Exception as e:
        logger.error(f"Error sending brands: {e}")
        await websocket.send_json({
            "type": "error",
            "message": "Failed to fetch brands"
        })

async def create_brand(websocket: WebSocket, data: dict, user_info: dict, db):
    """Create a new brand with Cloudinary logo upload"""
    try:
        # 🔍 DEBUG: Log user_info structure
        logger.info(f"create_brand called with user_info: {user_info}")
        logger.info(f"Data received: {data}")
        
        # ✅ SAFE EMAIL EXTRACTION
        if not user_info or not isinstance(user_info, dict):
            user_email = "system"
            logger.warning("user_info is invalid, using 'system' as fallback")
        else:
            user_email = (
                user_info.get("email") or 
                user_info.get("sub") or 
                user_info.get("username") or 
                "unknown_user"
            )
            if user_email == "unknown_user":
                logger.warning(f"No email found in user_info. Available keys: {list(user_info.keys())}")

        required_fields = ["name"]
        for field in required_fields:
            if field not in data or not data[field]:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Missing required field: {field}"
                })
                return

        # Extract logo data for upload
        logo_data = data.get("logo", "")

        custom_id = await id_generator.generate_brand_id(data["name"])
        # Create brand data without logo first
        brand_data = {
            "id": custom_id,
            "name": data["name"],
            "description": data.get("description", ""),
            "logo": "",  # Will be updated after Cloudinary upload
            "status": data.get("status", "active"),
            "is_active": data.get("status", "active") == "active",
            "created_at": datetime.utcnow(),
            "created_by": user_email,
            "updated_at": datetime.utcnow()
        }

        # Insert brand first
        brand_id = await db.insert_one("brands", brand_data)
        logger.info(f"Brand created with ID: {brand_id}")

        # Upload logo to Cloudinary if provided
        final_logo_url = ""
        if logo_data and logo_data.strip() and logo_data.startswith('data:'):
            try:
                await websocket.send_json({
                    "type": "upload_progress",
                    "message": "Uploading logo to Cloudinary...",
                    "progress": 30
                })
                
                # Upload to Cloudinary with organized folder structure
                logger.info("Starting Cloudinary upload...")
                upload_result = await CloudinaryManager.upload_image(
                    logo_data,
                    folder="brands",
                    public_id=f"brand_{brand_id}_logo"
                )
                
                if upload_result and upload_result.get("urls"):
                    # Use the original URL from Cloudinary
                    final_logo_url = upload_result["urls"]["original"]
                    
                    # Update brand with logo URL
                    await db.update_one(
                        "brands",
                        {"_id": ObjectId(brand_id)},
                        {"$set": {"logo": final_logo_url}}
                    )
                    
                    logger.info(f"Logo uploaded successfully: {final_logo_url}")
                    
                    await websocket.send_json({
                        "type": "upload_progress",
                        "message": "Logo uploaded successfully!",
                        "progress": 100
                    })
                else:
                    logger.error("Cloudinary upload failed - no result returned")
                    await websocket.send_json({
                        "type": "upload_progress",
                        "message": "Logo upload failed, brand created without logo",
                        "progress": 100
                    })
                    
            except Exception as upload_error:
                logger.error(f"Error uploading brand logo: {upload_error}")
                await websocket.send_json({
                    "type": "upload_progress", 
                    "message": "Logo upload failed, brand created without logo",
                    "progress": 100
                })
                # Continue without logo - don't fail the entire operation
        
        # Get final brand with logo
        created_brand = await db.find_one("brands", {"_id": ObjectId(brand_id)})
        created_brand = serialize_document(created_brand)
        
        logger.info(f"Final brand data: {created_brand}")

        # Send success response
        await websocket.send_json({
            "type": "brand_created",
            "brand": created_brand,
        })

        # Broadcast fresh data to all connected admins
        await broadcast_brands_data(db)
        
        logger.info(f"Brand created: {created_brand['name']} by {user_email}")

    except Exception as e:
        logger.error(f"Error creating brand: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to create brand: {str(e)}"
        })

async def update_brand(websocket: WebSocket, data: dict, user_info: dict, db):
    """Update an existing brand with Cloudinary logo upload"""
    try:
        # 🔍 DEBUG: Log user_info structure
        logger.info(f"update_brand called with user_info: {user_info}")
        logger.info(f"Update data: {data}")
        
        # ✅ SAFE EMAIL EXTRACTION
        if not user_info or not isinstance(user_info, dict):
            user_email = "system"
            logger.warning("user_info is invalid, using 'system' as fallback")
        else:
            user_email = (
                user_info.get("email") or 
                user_info.get("sub") or 
                user_info.get("username") or 
                "unknown_user"
            )
            if user_email == "unknown_user":
                logger.warning(f"No email found in user_info. Available keys: {list(user_info.keys())}")

        brand_id = data.get("_id")

        if not brand_id:
            await websocket.send_json({
                "type": "error",
                "message": "Brand ID is required"
            })
            return
        
        # Get current brand for logo management
        current_brand = await db.find_one("brands", {"_id": ObjectId(brand_id)})
        if not current_brand:
            await websocket.send_json({
                "type": "error",
                "message": "Brand not found"
            })
            return
        
        # Extract logo data for upload
        logo_data = data.get("logo", "")
        
        # Remove ID and logo from update data initially
        updated_data = {k: v for k, v in data.items() if k not in ["_id", "id", "logo"]}
        updated_data['updated_at'] = datetime.utcnow()
        updated_data['updated_by'] = user_email
        updated_data['is_active'] = updated_data.get("status", "active") == "active"

        # Handle logo upload if new logo provided (base64 data)
        if logo_data and logo_data.strip() and logo_data.startswith('data:'):
            try:
                await websocket.send_json({
                    "type": "upload_progress",
                    "message": "Uploading new logo to Cloudinary...",
                    "progress": 30
                })
                
                # Delete old logo if exists
                if current_brand.get("logo") and "cloudinary.com" in current_brand["logo"]:
                    try:
                        old_public_id = f"brands/brand_{brand_id}_logo"
                        deleted = await CloudinaryManager.delete_image(old_public_id)
                        if deleted:
                            logger.info(f"Deleted old logo: {old_public_id}")
                    except Exception as delete_error:
                        logger.warning(f"Failed to delete old logo: {delete_error}")
                
                # Upload new logo
                logger.info("Uploading new logo to Cloudinary...")
                upload_result = await CloudinaryManager.upload_image(
                    logo_data,
                    folder="brands",
                    public_id=f"brand_{brand_id}_logo"
                )
                
                if upload_result and upload_result.get("urls"):
                    updated_data["logo"] = upload_result["urls"]["original"]
                    logger.info(f"New logo uploaded: {updated_data['logo']}")
                    
                    await websocket.send_json({
                        "type": "upload_progress",
                        "message": "Logo uploaded successfully!",
                        "progress": 100
                    })
                else:
                    logger.error("Cloudinary upload failed for brand update")
                    await websocket.send_json({
                        "type": "upload_progress",
                        "message": "Logo upload failed, brand updated without new logo",
                        "progress": 100
                    })
                    
            except Exception as upload_error:
                logger.error(f"Error uploading brand logo during update: {upload_error}")
                await websocket.send_json({
                    "type": "upload_progress",
                    "message": "Logo upload failed, brand updated without new logo", 
                    "progress": 100
                })
        else:
            # No new logo provided, keep existing logo
            if not logo_data:
                updated_data["logo"] = current_brand.get("logo", "")
                logger.info("No new logo provided, keeping existing logo")

        logger.info(f"Updating brand {brand_id} with data: {updated_data}")

        # Update brand in database
        result = await db.update_one(
            "brands", 
            {"_id": ObjectId(brand_id)}, 
            {"$set": updated_data}
        )

        if result:
            # Get updated brand
            updated_brand = await db.find_one("brands", {"_id": ObjectId(brand_id)})
            updated_brand = serialize_document(updated_brand)
            
            logger.info(f"Brand updated successfully: {updated_brand}")

            # Send success response
            await websocket.send_json({
                "type": "brand_updated",
                "brand": updated_brand
            })
            
            # Broadcast fresh data to all connected admins
            await broadcast_brands_data(db)
            
            logger.info(f"Brand updated: {updated_brand['name']} by {user_email}")
        else:
            await websocket.send_json({
                "type": "error",
                "message": "Failed to update brand in database"
            })
            
    except KeyError as ke:
        logger.error(f"KeyError in update_brand: {ke}")
        logger.error(f"user_info structure: {user_info}")
        await websocket.send_json({
            "type": "error",
            "message": f"Missing required field: {str(ke)}"
        })
    except Exception as e:
        logger.error(f"Error updating brand: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        logger.error(f"user_info provided: {user_info}")
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to update brand: {str(e)}"
        })

async def delete_brand(websocket: WebSocket, data: dict, user_info: dict, db):
    """Delete a brand with logo cleanup"""
    try:
        # ✅ SAFE EMAIL EXTRACTION
        if not user_info or not isinstance(user_info, dict):
            user_email = "system"
        else:
            user_email = (
                user_info.get("email") or 
                user_info.get("sub") or 
                user_info.get("username") or 
                "unknown_user"
            )

        brand_id = data.get("_id")

        if not brand_id:
            await websocket.send_json({
                "type": "error",
                "message": "Brand ID is required"
            })
            return

        # Get brand before deletion for logo cleanup
        brand = await db.find_one("brands", {"_id": ObjectId(brand_id)})
        
        # Delete logo from Cloudinary if exists
        if brand and brand.get("logo") and "cloudinary.com" in brand["logo"]:
            try:
                public_id = f"brands/brand_{brand_id}_logo"
                deleted = await CloudinaryManager.delete_image(public_id)
                if deleted:
                    logger.info(f"Deleted logo from Cloudinary: {public_id}")
                else:
                    logger.warning(f"Failed to delete logo from Cloudinary: {public_id}")
            except Exception as cloudinary_error:
                logger.warning(f"Error deleting logo from Cloudinary: {cloudinary_error}")

        # Delete brand from database
        result = await db.delete_one("brands", {"_id": ObjectId(brand_id)})

        if result:
            # Send success response
            await websocket.send_json({
                "type": "brand_deleted",
                "brandId": str(brand_id),
                "deleted_by": user_email
            })
            
            # Broadcast fresh data to all connected admins
            await broadcast_brands_data(db)
            
            logger.info(f"Brand deleted: {brand.get('name', 'Unknown') if brand else 'Unknown'} by {user_email}")
        else:
            await websocket.send_json({
                "type": "error",
                "message": "Brand not found"
            })
    except Exception as e:
        logger.error(f"Error deleting brand: {e}")
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to delete brand: {str(e)}"
        })

async def broadcast_brands_data(db):
    """Broadcast fresh brands data to all connected admins"""
    try:
        brands = await db.find_many("brands", {}, sort=[("name", 1)])
        serialized_brands = [serialize_document(brand) for brand in brands]

        message = {
            "type": "brands_data",
            "brands": serialized_brands
        }
        
        # Send to all connections
        await manager.broadcast_to_all(message)
        
    except Exception as e:
        logger.error(f"Error broadcasting brands data: {e}")