import asyncio
from webbrowser import get
from fastapi import WebSocket
from admin.utils.serialize import serialize_document
import logging
from admin.connection_manager import manager
from admin.config.cloudinary_config import CloudinaryManager
from bson import ObjectId
from datetime import datetime
from admin.utils.id_generator import get_id_generator

id_generator = get_id_generator()

logger = logging.getLogger(__name__)

async def send_products(websocket: WebSocket, db):
    """Send all products, categories, and brands to the admin"""
    try:
        # Fetch all data in parallel
        products_cursor = db.find_many("products", {}, sort=[("created_at", -1)])
        categories_cursor = db.find_many("categories", {})
        brands_cursor = db.find_many("brands", {})

        products, categories, brands = await asyncio.gather(
            products_cursor,
            categories_cursor,
            brands_cursor
        )

        # Serialize all data
        serialized_products = [serialize_document(p) for p in products]
        serialized_categories = [serialize_document(c) for c in categories]
        serialized_brands = [serialize_document(b) for b in brands]

        await websocket.send_json({
            "type": "products_data",
            "products": serialized_products,
            "categories": serialized_categories,
            "brands": serialized_brands
        })
    except Exception as e:
        logger.error(f"Error sending products data: {e}")
        await websocket.send_json({
            "type": "error",
            "message": "Failed to fetch products data"
        })

async def create_product(websocket: WebSocket, data: dict, user_info: dict, db):
    """Create product with multiple Cloudinary images upload"""
    try:
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

        # Validate required fields
        required_fields = ["name", "description", "price", "category", "brand", "stock"]
        for field in required_fields:
            if field not in data or not data[field]:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Missing or empty required field: {field}"
                })
                return
        
        # Extract images data for upload
        images_data = data.get("images", [])
        logger.info(f"Creating product with {len(images_data)} images")
        # print(data)
        category = await db.find_one("categories", {"_id": ObjectId(data["category"])})

        custom_id = await id_generator.generate_product_id(category['name'])
        # Create product data without images first
        product_data = {
            "id": custom_id,
            "name": data["name"],
            "description": data["description"],
            "price": float(data["price"]),
            "category": category['id'],
            "brand": data["brand"],
            "stock": int(data["stock"]),
            "keywords": validate_and_clean_keywords(data.get("keywords", [])),
            "tags": data.get("tags", []),
            "attributes": data.get("attributes", {}),
            "images": [],  # ✅ Will be populated after upload
            "status": data.get("status", "active"),
            "is_active": data.get("status", "active") == "active",
            "created_at": datetime.utcnow(),
            "created_by": user_email,
            "updated_at": datetime.utcnow()
        }
        
        # Insert product first
        product_id = await db.insert_one("products", product_data)
        logger.info(f"Product created with ID: {product_id}")
        
        # Upload images to Cloudinary if provided
        uploaded_images = []
        if images_data and len(images_data) > 0:
            try:
                await websocket.send_json({
                    "type": "upload_progress",
                    "message": f"Uploading {len(images_data)} images to Cloudinary...",
                    "progress": 10
                })
                
                # Upload each image
                for i, image_data in enumerate(images_data):
                    if image_data and image_data.strip() and image_data.startswith('data:'):
                        try:
                            # Send progress update
                            progress = 10 + (70 * (i + 1) // len(images_data))
                            await websocket.send_json({
                                "type": "upload_progress",
                                "message": f"Uploading image {i + 1} of {len(images_data)}...",
                                "progress": progress
                            })
                            
                            # Upload to Cloudinary with index in public_id
                            upload_result = await CloudinaryManager.upload_image(
                                image_data,
                                folder="products",
                                public_id=f"product_{product_id}_image_{i}"
                            )
                            
                            if upload_result and upload_result.get("urls"):
                                uploaded_images.append({
                                    "url": upload_result["urls"]["original"],
                                    "thumbnail": upload_result["urls"]["thumbnail"],
                                    "public_id": upload_result["public_id"],
                                    "index": i,
                                    "is_primary": i == 0  # First image is primary
                                })
                                logger.info(f"Image {i + 1} uploaded successfully")
                            else:
                                logger.error(f"Failed to upload image {i + 1}")
                                
                        except Exception as img_error:
                            logger.error(f"Error uploading image {i + 1}: {img_error}")
                            continue
                
                # Update product with images array
                if uploaded_images:
                    await db.update_one(
                        "products",
                        {"_id": ObjectId(product_id)},
                        {"$set": {"images": uploaded_images}}
                    )
                    
                    await websocket.send_json({
                        "type": "upload_progress",
                        "message": f"Successfully uploaded {len(uploaded_images)} of {len(images_data)} images!",
                        "progress": 100
                    })
                else:
                    await websocket.send_json({
                        "type": "upload_progress",
                        "message": "Failed to upload images, product created without images",
                        "progress": 100
                    })
                    
            except Exception as upload_error:
                logger.error(f"Error uploading product images: {upload_error}")
                await websocket.send_json({
                    "type": "upload_progress",
                    "message": "Image upload failed, product created without images",
                    "progress": 100
                })
        
        # Get created product with images
        created_product = await db.find_one("products", {"_id": ObjectId(product_id)})
        created_product = serialize_document(created_product)
        
        logger.info(f"Final product data with {len(created_product.get('images', []))} images")

        # Send success response
        await websocket.send_json({
            "type": "product_created",
            "product": created_product,
            "images_uploaded": len(uploaded_images)
        })
        
        # Broadcast fresh data to ALL connected admins
        await broadcast_products_data(db)
        
        logger.info(f"Product created: {created_product['name']} with {len(uploaded_images)} images by {user_email}")
        
    except Exception as e:
        logger.error(f"Error creating product: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to create product: {str(e)}"
        })

async def update_product(websocket: WebSocket, data: dict, user_info: dict, db):
    """Update an existing product with multiple images support"""
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
        print(data)
        product_id = data.get("id")
        if not product_id:
            await websocket.send_json({
                "type": "error",
                "message": "Product ID is required"
            })
            return
        
        # Get current product for image management
        current_product = await db.find_one("products", {"id": product_id})
        if not current_product:
            await websocket.send_json({
                "type": "error",
                "message": "Product not found"
            })
            return
        
        # Extract images data
        images_data = data.get("images", [])
        
        # Remove ID and images from update data initially
        update_data = {k: v for k, v in data.items() if k not in ["_id", "id", "images"]}
        
        # Convert ObjectIds and validate data
        if "price" in update_data:
            update_data["price"] = float(update_data["price"])
        if "stock" in update_data:
            update_data["stock"] = int(update_data["stock"])
        if "keywords" in update_data:
            update_data["keywords"] = validate_and_clean_keywords(update_data["keywords"])
        
        # Add metadata
        update_data["updated_at"] = datetime.utcnow()
        update_data["updated_by"] = user_email
        update_data["is_active"] = update_data.get("status", "active") == "active"

        # Handle images upload if new images provided
        if images_data and len(images_data) > 0 and all(img.startswith('data:') for img in images_data):
            try:
                await websocket.send_json({
                    "type": "upload_progress",
                    "message": f"Uploading {len(images_data)} new images to Cloudinary...",
                    "progress": 10
                })
                
                # Delete old images if they exist
                current_images = current_product.get("images", [])
                if current_images:
                    for img in current_images:
                        if isinstance(img, dict) and img.get("public_id"):
                            try:
                                await CloudinaryManager.delete_image(img["public_id"])
                            except Exception as delete_error:
                                logger.warning(f"Failed to delete old image: {delete_error}")
                
                # Upload new images
                uploaded_images = []
                for i, image_data in enumerate(images_data):
                    try:
                        # Send progress update
                        progress = 10 + (70 * (i + 1) // len(images_data))
                        await websocket.send_json({
                            "type": "upload_progress",
                            "message": f"Uploading image {i + 1} of {len(images_data)}...",
                            "progress": progress
                        })
                        
                        upload_result = await CloudinaryManager.upload_image(
                            image_data,
                            folder="products",
                            public_id=f"product_{product_id}_image_{i}"
                        )
                        
                        if upload_result and upload_result.get("urls"):
                            uploaded_images.append({
                                "url": upload_result["urls"]["original"],
                                "thumbnail": upload_result["urls"]["thumbnail"],
                                "public_id": upload_result["public_id"],
                                "index": i,
                                "is_primary": i == 0
                            })
                            
                    except Exception as img_error:
                        logger.error(f"Error uploading image {i + 1}: {img_error}")
                        continue
                
                if uploaded_images:
                    update_data["images"] = uploaded_images
                    logger.info(f"Successfully uploaded {len(uploaded_images)} images")
                    
                    await websocket.send_json({
                        "type": "upload_progress",
                        "message": f"Successfully uploaded {len(uploaded_images)} of {len(images_data)} images!",
                        "progress": 100
                    })
                else:
                    logger.error("Failed to upload any images for product update")
                    await websocket.send_json({
                        "type": "upload_progress",
                        "message": "Image upload failed, product updated without new images",
                        "progress": 100
                    })
                    
            except Exception as upload_error:
                logger.error(f"Error uploading product images during update: {upload_error}")
                await websocket.send_json({
                    "type": "upload_progress",
                    "message": "Image upload failed, product updated without new images",
                    "progress": 100
                })
        else:
            # No new images provided, keep existing images
            if not images_data:
                update_data["images"] = current_product.get("images", [])
                logger.info("No new images provided, keeping existing images")
        
        # Update product
        result = await db.update_one(
            "products",
            {"id": product_id},
            {"$set": update_data}
        )
        
        if result:
            # Get updated product
            updated_product = await db.find_one("products", {"id": product_id})
            updated_product = serialize_document(updated_product)

            # Send success response
            await websocket.send_json({
                "type": "product_updated",
                "product": updated_product
            })
            
            # Broadcast fresh data to ALL connected admins
            await broadcast_products_data(db)
            
            logger.info(f"Product updated: {updated_product['name']} by {user_email}")
        else:
            await websocket.send_json({
                "type": "error",
                "message": "Product not found"
            })
            
    except Exception as e:
        logger.error(f"Error updating product: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to update product: {str(e)}"
        })

async def delete_product(websocket: WebSocket, data: dict, user_info: dict, db):
    """Delete a product with all images cleanup"""
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
        
        product_id = data.get("id")
        
        if not product_id:
            await websocket.send_json({
                "type": "error",
                "message": "Product ID is required"
            })
            return
        
        # Get product before deletion for images cleanup
        product = await db.find_one("products", {"id": product_id})
        
        # Delete all images from Cloudinary if they exist
        if product and product.get("images"):
            images = product["images"]
            deleted_count = 0
            
            for img in images:
                try:
                    if isinstance(img, dict) and img.get("public_id"):
                        # Delete using public_id from image object
                        deleted = await CloudinaryManager.delete_image(img["public_id"])
                        if deleted:
                            deleted_count += 1
                    elif isinstance(img, str) and "cloudinary.com" in img:
                        # Fallback: try to delete using generated public_id pattern
                        public_id = f"products/product_{product_id}_image_0"
                        deleted = await CloudinaryManager.delete_image(public_id)
                        if deleted:
                            deleted_count += 1
                except Exception as cloudinary_error:
                    logger.warning(f"Error deleting image from Cloudinary: {cloudinary_error}")
            
            logger.info(f"Deleted {deleted_count} images from Cloudinary for product {product_id}")

        # Delete product from database
        result = await db.delete_one("products", {"id": product_id})
        
        if result:
            # Send success response
            await websocket.send_json({
                "type": "product_deleted",
                "productId": product_id
            })
            
            # Broadcast fresh data to ALL connected admins
            await broadcast_products_data(db)
            
            logger.info(f"Product deleted: {product.get('name', 'Unknown') if product else 'Unknown'} by {user_email}")
        else:
            await websocket.send_json({
                "type": "error",
                "message": "Product not found"
            })
            
    except Exception as e:
        logger.error(f"Error deleting product: {e}")
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to delete product: {str(e)}"
        })

async def broadcast_products_data(db):
    """Broadcast fresh products data to all connected admins"""
    try:
        # Fetch all data
        products_cursor = db.find_many("products", {}, sort=[("created_at", -1)])
        categories_cursor = db.find_many("categories", {})
        brands_cursor = db.find_many("brands", {})

        products, categories, brands = await asyncio.gather(
            products_cursor,
            categories_cursor,
            brands_cursor
        )

        # Serialize all data
        serialized_products = [serialize_document(p) for p in products]
        serialized_categories = [serialize_document(c) for c in categories]
        serialized_brands = [serialize_document(b) for b in brands]

        # Broadcast to all connected admins
        message = {
            "type": "products_data",
            "products": serialized_products,
            "categories": serialized_categories,
            "brands": serialized_brands
        }
        
        # Send to all connections managed by connection manager
        await manager.broadcast_to_all(message)
        
    except Exception as e:
        logger.error(f"Error broadcasting products data: {e}")

# ✅ Enhanced helper functions
def validate_and_clean_keywords(keywords):
    """Validate and clean keywords"""
    if not keywords:
        return []
    
    if isinstance(keywords, str):
        keywords = [kw.strip() for kw in keywords.split(',') if kw.strip()]
    elif isinstance(keywords, list):
        keywords = [str(kw).strip() for kw in keywords if str(kw).strip()]
    
    # Remove duplicates and limit length
    cleaned = list(dict.fromkeys(keywords))  # Remove duplicates while preserving order
    return cleaned[:20]  # Limit to 20 keywords

def generate_slug(name):
    """Generate a URL-friendly slug from product name"""
    import re
    slug = name.lower()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[\s_-]+', '-', slug)
    slug = slug.strip('-')
    return slug

# ✅ Additional helper function for image management
async def handle_add_product_images(websocket: WebSocket, data: dict, user_info: dict, db):
    """Add additional images to existing product"""
    try:
        product_id = data.get("product_id")
        new_images = data.get("images", [])
        
        if not product_id:
            await websocket.send_json({
                "type": "error",
                "message": "Product ID is required"
            })
            return
        
        if not new_images:
            await websocket.send_json({
                "type": "error",
                "message": "No images provided"
            })
            return
        
        # Get current product
        product = await db.find_one("products", {"_id": ObjectId(product_id)})
        if not product:
            await websocket.send_json({
                "type": "error",
                "message": "Product not found"
            })
            return
        
        current_images = product.get("images", [])
        
        # Check total image limit
        if len(current_images) + len(new_images) > 10:
            await websocket.send_json({
                "type": "error",
                "message": f"Maximum 10 images allowed. Current: {len(current_images)}, Trying to add: {len(new_images)}"
            })
            return
        
        # Upload new images
        uploaded_images = []
        start_index = len(current_images)
        
        for i, image_data in enumerate(new_images):
            if image_data and image_data.startswith('data:'):
                try:
                    upload_result = await CloudinaryManager.upload_image(
                        image_data,
                        folder="products",
                        public_id=f"product_{product_id}_image_{start_index + i}"
                    )
                    
                    if upload_result and upload_result.get("urls"):
                        uploaded_images.append({
                            "url": upload_result["urls"]["original"],
                            "thumbnail": upload_result["urls"]["thumbnail"],
                            "public_id": upload_result["public_id"],
                            "index": start_index + i,
                            "is_primary": False  # Additional images are not primary
                        })
                        
                except Exception as img_error:
                    logger.error(f"Error uploading additional image {i}: {img_error}")
        
        # Update product with combined images
        all_images = current_images + uploaded_images
        await db.update_one(
            "products",
            {"_id": ObjectId(product_id)},
            {"$set": {"images": all_images}}
        )
        
        await websocket.send_json({
            "type": "images_added",
            "product_id": str(product_id),
            "new_images": uploaded_images,
            "total_images": len(all_images)
        })
        
        # Broadcast updated data
        await broadcast_products_data(db)
        
    except Exception as e:
        logger.error(f"Error adding product images: {e}")
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to add images: {str(e)}"
        })