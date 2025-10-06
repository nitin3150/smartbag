from fastapi import WebSocket
import logging
from admin.utils.serialize import serialize_document
from datetime import datetime
from admin.config.cloudinary_config import CloudinaryManager
from bson import ObjectId
from admin.connection_manager import manager
from admin.utils.id_generator import get_id_generator

id_generator = get_id_generator()

logger = logging.getLogger(__name__)

async def send_categories(websocket: WebSocket, db):
    """Send all categories"""
    try:
        categories = await db.find_many("categories", {}, sort=[("name", 1)])
        serialized_categories = [serialize_document(cat) for cat in categories]
        
        await websocket.send_json({
            "type": "categories_data",
            "categories": serialized_categories
        })
    except Exception as e:
        logger.error(f"Error sending categories: {e}")
        await websocket.send_json({
            "type": "error",
            "message": "Failed to fetch categories"
        })

async def create_categories(websocket: WebSocket, data: dict, user_info: dict, db):
    """Create a new category with Cloudinary image upload"""
    try:
        # 🔍 DEBUG: Log user_info structure
        logger.info(f"create_categories called with user_info: {user_info}")
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
        
        # Extract image data for upload
        image_data = data.get("image", "")

        custom_id = await id_generator.generate_category_id(data["name"])
        # Create category data without image first
        category_data = {
            "id": custom_id,
            "name": data["name"],
            "description": data.get("description", ""),
            "image": "",  # Will be updated after Cloudinary upload
            "parentId": ObjectId(data["parentId"]) if data.get("parentId") else None,
            "icon": [],  # Keep for compatibility
            "status": data.get("status", "active"),
            "is_active": data.get("status", "active") == "active",
            "created_at": datetime.utcnow(),
            "created_by": user_email,
            "updated_at": datetime.utcnow()
        }

        # Insert category first
        category_id = await db.insert_one("categories", category_data)
        logger.info(f"Category created with ID: {category_id}")

        # Upload image to Cloudinary if provided
        final_image_url = ""
        if image_data and image_data.strip() and image_data.startswith('data:'):
            try:
                await websocket.send_json({
                    "type": "upload_progress",
                    "message": "Uploading image to Cloudinary...",
                    "progress": 30
                })
                
                # Upload to Cloudinary with organized folder structure
                logger.info("Starting Cloudinary upload for category image...")
                upload_result = await CloudinaryManager.upload_image(
                    image_data,
                    folder="categories",
                    public_id=f"category_{category_id}_image"
                )
                
                if upload_result and upload_result.get("urls"):
                    # Use the original URL from Cloudinary
                    final_image_url = upload_result["urls"]["original"]
                    
                    # Update category with image URL
                    await db.update_one(
                        "categories",
                        {"_id": ObjectId(category_id)},
                        {"$set": {"image": final_image_url}}
                    )
                    
                    logger.info(f"Category image uploaded successfully: {final_image_url}")
                    
                    await websocket.send_json({
                        "type": "upload_progress",
                        "message": "Image uploaded successfully!",
                        "progress": 100
                    })
                else:
                    logger.error("Cloudinary upload failed - no result returned")
                    await websocket.send_json({
                        "type": "upload_progress",
                        "message": "Image upload failed, category created without image",
                        "progress": 100
                    })
                    
            except Exception as upload_error:
                logger.error(f"Error uploading category image: {upload_error}")
                await websocket.send_json({
                    "type": "upload_progress", 
                    "message": "Image upload failed, category created without image",
                    "progress": 100
                })
                # Continue without image - don't fail the entire operation
        
        # Get final category with image
        created_category = await db.find_one("categories", {"_id": ObjectId(category_id)})
        created_category = serialize_document(created_category)
        
        logger.info(f"Final category data: {created_category}")

        # Send success response
        await websocket.send_json({
            "type": "category_created",
            "category": created_category,
        })

        # Broadcast fresh data to all connected admins
        await broadcast_categories_data(db)
        
        logger.info(f"Category created: {created_category['name']} by {user_email}")

    except Exception as e:
        logger.error(f"Error creating category: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to create category: {str(e)}"
        })

async def update_category(websocket: WebSocket, data: dict, user_info: dict, db):
    """Update an existing category with Cloudinary image upload"""
    try:
        # 🔍 DEBUG: Log user_info structure
        logger.info(f"update_category called with user_info: {user_info}")
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

        category_id = data.get("_id")

        if not category_id:
            await websocket.send_json({
                "type": "error",
                "message": "Category ID is required"
            })
            return
        
        # Get current category for image management
        current_category = await db.find_one("categories", {"_id": ObjectId(category_id)})
        if not current_category:
            await websocket.send_json({
                "type": "error",
                "message": "Category not found"
            })
            return
        
        # Extract image data for upload
        image_data = data.get("image", "")
        
        # Remove ID and image from update data initially
        updated_data = {k: v for k, v in data.items() if k not in ["_id", "id", "image"]}
        updated_data['updated_at'] = datetime.utcnow()
        updated_data['updated_by'] = user_email
        updated_data['is_active'] = updated_data.get("status", "active") == "active"
        
        # Handle parentId conversion
        if "parentId" in updated_data:
            if updated_data["parentId"] and updated_data["parentId"] != "none":
                try:
                    updated_data["parentId"] = ObjectId(updated_data["parentId"])
                except Exception as oid_error:
                    logger.error(f"Invalid parentId format: {updated_data['parentId']}")
                    updated_data["parentId"] = None
            else:
                updated_data["parentId"] = None

        # Handle image upload if new image provided (base64 data)
        if image_data and image_data.strip() and image_data.startswith('data:'):
            try:
                await websocket.send_json({
                    "type": "upload_progress",
                    "message": "Uploading new image to Cloudinary...",
                    "progress": 30
                })
                
                # Delete old image if exists
                if current_category.get("image") and "cloudinary.com" in current_category["image"]:
                    try:
                        old_public_id = f"categories/category_{category_id}_image"
                        deleted = await CloudinaryManager.delete_image(old_public_id)
                        if deleted:
                            logger.info(f"Deleted old image: {old_public_id}")
                    except Exception as delete_error:
                        logger.warning(f"Failed to delete old image: {delete_error}")
                
                # Upload new image
                logger.info("Uploading new image to Cloudinary...")
                upload_result = await CloudinaryManager.upload_image(
                    image_data,
                    folder="categories",
                    public_id=f"category_{category_id}_image"
                )
                
                if upload_result and upload_result.get("urls"):
                    updated_data["image"] = upload_result["urls"]["original"]
                    logger.info(f"New image uploaded: {updated_data['image']}")
                    
                    await websocket.send_json({
                        "type": "upload_progress",
                        "message": "Image uploaded successfully!",
                        "progress": 100
                    })
                else:
                    logger.error("Cloudinary upload failed for category update")
                    await websocket.send_json({
                        "type": "upload_progress",
                        "message": "Image upload failed, category updated without new image",
                        "progress": 100
                    })
                    
            except Exception as upload_error:
                logger.error(f"Error uploading category image during update: {upload_error}")
                await websocket.send_json({
                    "type": "upload_progress",
                    "message": "Image upload failed, category updated without new image", 
                    "progress": 100
                })
        else:
            # No new image provided, keep existing image
            if not image_data:
                updated_data["image"] = current_category.get("image", "")
                logger.info("No new image provided, keeping existing image")

        logger.info(f"Updating category {category_id} with data: {updated_data}")

        # Update category in database
        result = await db.update_one(
            "categories", 
            {"_id": ObjectId(category_id)}, 
            {"$set": updated_data}
        )

        if result:
            # Get updated category
            updated_cat = await db.find_one("categories", {"_id": ObjectId(category_id)})
            updated_cat = serialize_document(updated_cat)
            
            logger.info(f"Category updated successfully: {updated_cat}")

            # Send success response
            await websocket.send_json({
                "type": "category_updated",
                "category": updated_cat
            })
            
            # Broadcast fresh data to all connected admins
            await broadcast_categories_data(db)
            
            logger.info(f"Category updated: {updated_cat['name']} by {user_email}")
        else:
            await websocket.send_json({
                "type": "error",
                "message": "Failed to update category in database"
            })
            
    except KeyError as ke:
        logger.error(f"KeyError in update_category: {ke}")
        logger.error(f"user_info structure: {user_info}")
        await websocket.send_json({
            "type": "error",
            "message": f"Missing required field: {str(ke)}"
        })
    except Exception as e:
        logger.error(f"Error updating category: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        logger.error(f"user_info provided: {user_info}")
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to update category: {str(e)}"
        })

async def delete_category(websocket: WebSocket, data: dict, user_info: dict, db):
    """Delete a category with image cleanup"""
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
        
        category_id = data.get("_id")
        
        if not category_id:
            await websocket.send_json({
                "type": "error",
                "message": "Category ID is required"
            })
            return

        # Get category before deletion for cleanup and validation
        category = await db.find_one("categories", {"_id": ObjectId(category_id)})
        
        # Check if category has child categories
        child_categories = await db.find_many("categories", {"parentId": ObjectId(category_id)})
        if child_categories:
            await websocket.send_json({
                "type": "error",
                "message": "Cannot delete category with subcategories. Please delete or move subcategories first."
            })
            return

        # Delete image from Cloudinary if exists
        if category and category.get("image") and "cloudinary.com" in category["image"]:
            try:
                public_id = f"categories/category_{category_id}_image"
                deleted = await CloudinaryManager.delete_image(public_id)
                if deleted:
                    logger.info(f"Deleted image from Cloudinary: {public_id}")
                else:
                    logger.warning(f"Failed to delete image from Cloudinary: {public_id}")
            except Exception as cloudinary_error:
                logger.warning(f"Error deleting image from Cloudinary: {cloudinary_error}")

        # Delete category from database
        result = await db.delete_one("categories", {"_id": ObjectId(category_id)})
        
        if result:
            # Send success response
            await websocket.send_json({
                "type": "category_deleted",
                "categoryId": str(category_id),
                "deleted_by": user_email
            })
            
            # Broadcast fresh data to all connected admins
            await broadcast_categories_data(db)
            
            logger.info(f"Category deleted: {category.get('name', 'Unknown') if category else 'Unknown'} by {user_email}")
        else:
            await websocket.send_json({
                "type": "error",
                "message": "Category not found"
            })
    except Exception as e:
        logger.error(f"Error deleting category: {e}")
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to delete category: {str(e)}"
        })

async def broadcast_categories_data(db):
    """Broadcast fresh categories data to all connected admins"""
    try:
        categories = await db.find_many("categories", {}, sort=[("name", 1)])
        serialized_categories = [serialize_document(cat) for cat in categories]

        message = {
            "type": "categories_data",
            "categories": serialized_categories
        }
        
        # Send to all connections
        await manager.broadcast_to_all(message)
        
    except Exception as e:
        logger.error(f"Error broadcasting categories data: {e}")