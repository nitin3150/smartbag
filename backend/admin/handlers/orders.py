from fastapi import WebSocket
import logging
from datetime import datetime, timezone
from admin.utils.serialize import serialize_document
from admin.connection_manager import manager
from bson import ObjectId
# import re
from typing import Dict, Any, Optional, List
import math

logger = logging.getLogger(__name__)

async def send_orders(websocket: WebSocket, filters: dict, db):
    """Send orders with advanced filtering and pagination"""
    try:
        # Check if WebSocket is still connected
        if hasattr(websocket, 'client_state') and websocket.client_state.value != 1:
            logger.warning("WebSocket connection is not active, skipping send_orders")
            return
        
        # Build MongoDB query from filters
        query = await build_orders_query(filters)
        
        # Pagination parameters
        page = filters.get("page", 1)
        limit = filters.get("limit", 10)
        skip = (page - 1) * limit
        
        logger.info(f"Orders query: {query}")
        logger.info(f"Pagination: page={page}, limit={limit}, skip={skip}")
        
        # Get total count for pagination
        total_count = await db.count_documents("orders", query)
        
        # Optimized sort with compound index
        # Using your indexes: order_id (unique), created_at (desc), delivery_partner (asc)
        sort_criteria = [("created_at", -1)]  # Use your indexed field
        
        # Get orders with pagination
        orders = await db.find_many(
            "orders", 
            query, 
            sort=sort_criteria,
            skip=skip,
            limit=limit
        )
        
        # Calculate pagination info
        total_pages = math.ceil(total_count / limit) if total_count > 0 else 1
        has_prev = page > 1
        has_next = page < total_pages
        
        pagination_info = {
            "current_page": page,
            "total_pages": total_pages,
            "total_orders": total_count,
            "has_prev": has_prev,
            "has_next": has_next,
            "page_size": limit
        }
        
        logger.info(f"Pagination info: {pagination_info}")
        
        # Process orders with optimized queries
        serialized_orders = []
        
        # Batch fetch users and delivery partners to reduce DB calls
        user_ids = [order.get("user") for order in orders if order.get("user")]
        delivery_partner_ids = [order.get("delivery_partner") for order in orders 
                             if order.get("delivery_partner")]
        
        # Fetch users in batch
        users_dict = {}
        if user_ids:
            users = await db.find_many("users", {"_id": {"$in": user_ids}})
            users_dict = {str(user["_id"]): user for user in users}
        
        # Fetch delivery partners in batch
        delivery_partners_dict = {}
        if delivery_partner_ids:
            partners = await db.find_many("users", {"_id": {"$in": delivery_partner_ids}})
            delivery_partners_dict = {str(partner["_id"]): partner for partner in partners}
        
        # Batch fetch products for order items
        product_ids = []
        for order in orders:
            if order.get("items"):
                for item in order["items"]:
                    if item.get("product"):
                        product_ids.append(ObjectId(item["product"]))
        
        products_dict = {}
        if product_ids:
            products = await db.find_many("products", {"_id": {"$in": product_ids}})
            products_dict = {str(product["_id"]): product for product in products}
        
        # Process each order
        for order in orders:
            try:
                # Get user info
                user_id = str(order.get("user", ""))
                user = users_dict.get(user_id, {})
                
                # Get delivery partner info
                delivery_partner_id = str(order.get("delivery_partner", "")) if order.get("delivery_partner") else None
                delivery_partner = delivery_partners_dict.get(delivery_partner_id) if delivery_partner_id else None
                
                # Process order items
                if order.get("items"):
                    for item in order["items"]:
                        product_id = str(item.get("product", ""))
                        product = products_dict.get(product_id, {})
                        item["product_name"] = product.get("name", "Unknown Product")
                        item["product_image"] = product.get("images", [])
                
                # Serialize the order
                serialized_order = serialize_document(order)
                
                # Add frontend-friendly field mappings
                serialized_order["id"] = serialized_order["_id"]
                serialized_order["total"] = serialized_order.get("total_amount", 0)
                serialized_order["status"] = serialized_order.get("order_status", "pending")
                
                # Add user information
                serialized_order["user_name"] = user.get("name", "Unknown")
                serialized_order["user_email"] = user.get("email", "")
                serialized_order["user_phone"] = user.get("phone", "")
                
                # Add delivery partner information
                serialized_order["delivery_partner_name"] = (
                    delivery_partner.get("name") if delivery_partner else None
                )
                
                serialized_orders.append(serialized_order)
                
            except Exception as serialize_error:
                logger.error(f"Error serializing order {order.get('_id')}: {serialize_error}")
                continue
        
        logger.info(f"Sending {len(serialized_orders)} serialized orders with pagination")

        await websocket.send_json({
            "type": "orders_data",
            "channel": "orders",
            "orders": serialized_orders,
            "pagination": pagination_info
        })
        
    except Exception as e:
        logger.error(f"Error sending orders: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": "Failed to fetch orders"
            })
        except:
            logger.info("Could not send error message - client disconnected")

async def build_orders_query(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Build MongoDB query from filters with optimized performance"""
    query = {}
    
    try:
        # Status filter
        if filters.get("status") and filters["status"] != "all":
            query["order_status"] = filters["status"]
        
        # Date range filters - optimized for your created_at index
        date_conditions = []
        
        if filters.get("from_date"):
            try:
                from_date = datetime.fromisoformat(filters["from_date"].replace('Z', '+00:00'))
                date_conditions.append({"created_at": {"$gte": from_date}})
            except ValueError as e:
                logger.warning(f"Invalid from_date format: {filters['from_date']}")
        
        if filters.get("to_date"):
            try:
                to_date = datetime.fromisoformat(filters["to_date"].replace('Z', '+00:00'))
                date_conditions.append({"created_at": {"$lte": to_date}})
            except ValueError as e:
                logger.warning(f"Invalid to_date format: {filters['to_date']}")
        
        if date_conditions:
            if len(date_conditions) == 1:
                query.update(date_conditions[0])
            else:
                query["$and"] = date_conditions
        
        # Amount range filters
        amount_conditions = []
        
        if filters.get("min_amount"):
            try:
                min_amount = float(filters["min_amount"])
                amount_conditions.append({"total_amount": {"$gte": min_amount}})
            except ValueError:
                logger.warning(f"Invalid min_amount: {filters['min_amount']}")
        
        if filters.get("max_amount"):
            try:
                max_amount = float(filters["max_amount"])
                amount_conditions.append({"total_amount": {"$lte": max_amount}})
            except ValueError:
                logger.warning(f"Invalid max_amount: {filters['max_amount']}")
        
        if amount_conditions:
            if "$and" in query:
                query["$and"].extend(amount_conditions)
            else:
                query["$and"] = amount_conditions
        
        # Delivery partner filter - optimized for your delivery_partner index
        if filters.get("delivery_partner") and filters["delivery_partner"] != "all":
            if filters["delivery_partner"] == "unassigned":
                query["delivery_partner"] = None
            else:
                try:
                    query["delivery_partner"] = ObjectId(filters["delivery_partner"])
                except:
                    logger.warning(f"Invalid delivery_partner ID: {filters['delivery_partner']}")
        
        # Search functionality - for order ID and customer names
        # Note: This requires additional queries for customer names since they're in users collection
        search_conditions = []
        
        if filters.get("search"):
            search_term = filters["search"].strip()
            
            # Search by order ID (exact match or partial)
            if search_term.startswith('#'):
                # Remove # and search
                order_id_search = search_term[1:]
                search_conditions.append({"order_id": {"$regex": order_id_search, "$options": "i"}})
            else:
                # Search by order ID without #
                search_conditions.append({"order_id": {"$regex": search_term, "$options": "i"}})
        
        # Customer name search - this is more complex and expensive
        if filters.get("customer_name"):
            customer_name = filters["customer_name"].strip()
            # Find users with matching names first
            name_regex = {"$regex": customer_name, "$options": "i"}
            # This will need to be handled in the calling function to avoid circular imports
            # For now, we'll add it as a separate condition
            query["_customer_name_search"] = customer_name
        
        if search_conditions:
            if "$and" in query:
                query["$and"].extend(search_conditions)
            else:
                query["$or"] = search_conditions
        
        logger.info(f"Built query: {query}")
        return query
        
    except Exception as e:
        logger.error(f"Error building orders query: {e}")
        return {}

async def handle_customer_name_search(query: Dict[str, Any], db) -> Dict[str, Any]:
    """Handle customer name search by finding matching users first"""
    if "_customer_name_search" not in query:
        return query
    
    try:
        customer_name = query.pop("_customer_name_search")
        
        # Find users with matching names
        matching_users = await db.find_many(
            "users", 
            {"name": {"$regex": customer_name, "$options": "i"}},
            projection={"_id": 1}
        )
        
        if matching_users:
            user_ids = [user["_id"] for user in matching_users]
            
            # Add user filter to query
            if "$and" in query:
                query["$and"].append({"user": {"$in": user_ids}})
            else:
                query["user"] = {"$in": user_ids}
        else:
            # No matching users found, return empty result
            query["_id"] = ObjectId("000000000000000000000000")  # Non-existent ID
        
        return query
        
    except Exception as e:
        logger.error(f"Error handling customer name search: {e}")
        return query

# Enhanced send_orders function with customer name search
async def send_orders_enhanced(websocket: WebSocket, filters: dict, db):
    """Enhanced send_orders with customer name search support"""
    try:
        # Build initial query
        query = await build_orders_query(filters)
        
        # Handle customer name search if needed
        query = await handle_customer_name_search(query, db)
        
        # Continue with the rest of send_orders logic...
        # (Copy the rest of the send_orders function here)
        
    except Exception as e:
        logger.error(f"Error in enhanced send_orders: {e}")
        await websocket.send_json({
            "type": "error",
            "message": "Failed to fetch orders"
        })

async def update_order_status(websocket: WebSocket, data: dict, user_info: dict, db):
    """Update order status with correct field mappings"""
    try:
        order_id = data.get("order_id") or data.get("orderId") 
        new_status = data.get("status")
        delivery_partner = data.get("delivery_partner")
        notes = data.get("notes", "")
        
        if not order_id or not new_status:
            await websocket.send_json({
                "type": "error", 
                "message": "Order ID and status are required"
            })
            return
        
        # Update with correct database field names
        update_data = {
            "order_status": new_status,
            "updated_at": datetime.utcnow(),
        }
        
        if delivery_partner:
            update_data["delivery_partner"] = ObjectId(delivery_partner)
            
        # Update order
        result = await db.update_one(
            "orders",
            {"_id": ObjectId(order_id)}, 
            {"$set": update_data}
        )
        
        if result:
            # Send success response
            await websocket.send_json({
                "type": "order_updated",
                "success": True,
                "order_id": order_id
            })
        else:
            await websocket.send_json({
                "type": "error",
                "message": "Failed to update order"
            })
        
    except Exception as e:
        logger.error(f"Error updating order status: {e}")
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to update order status: {str(e)}"
        })

async def get_delivery_requests_for_order(websocket: WebSocket, data: dict, db):
    """Get delivery partners who requested a specific order"""
    try:
        order_id = ObjectId(data.get("order_id"))
        order = await db.find_one("orders", {"_id": order_id})
        
        if not order:
            await websocket.send_json({
                "type": "error",
                "message": "Order not found"
            })
            return
        
        partners = order.get("accepted_partners", [])
        partner_list = []

        # Batch fetch partner details
        if partners:
            partner_docs = await db.find_many("users", {"_id": {"$in": partners}})
            partner_list = [
                {
                    "id": str(partner["_id"]),
                    "name": partner.get("name", "Unknown"),
                    "email": partner.get("email", ""),
                    "phone": partner.get("phone", "")
                }
                for partner in partner_docs
            ]

        await websocket.send_json({
            "type": "delivery_requests_data",
            "delivery_requests": partner_list
        })
        
    except Exception as e:
        logger.error(f"Unable to get the requested partners: {e}")
        await websocket.send_json({
            "type": "error",
            "message": "Failed to get delivery requests"
        })

async def assign_delivery_partner(websocket: WebSocket, data: dict, db):
    """Assign a delivery partner to an order"""
    try:
        order_id = data.get("order_id")
        partner_id = data.get("delivery_partner_id")
        
        if not order_id or not partner_id:
            await websocket.send_json({
                "type": "error",
                "message": "Order ID and delivery partner ID are required"
            })
            return

        # Update order with delivery partner and change status
        result = await db.update_one(
            "orders", 
            {"_id": ObjectId(order_id)},
            {
                "$set": {
                    "delivery_partner": ObjectId(partner_id), 
                    "order_status": "assigned",
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        if result:
            logger.info(f"Successfully assigned delivery partner {partner_id} to order {order_id}")
            await websocket.send_json({
                "type": "order_assigned",
                "success": True,
                "data": {
                    "order_id": order_id,
                    "delivery_partner_id": partner_id
                }
            })
        else:
            logger.error(f"Failed to assign delivery partner to order {order_id}")
            await websocket.send_json({
                "type": "error",
                "message": "Failed to assign delivery partner"
            })
        
    except Exception as e:
        logger.error(f"Failed to assign delivery partner: {e}")
        await websocket.send_json({
            "type": "error",
            "message": "Failed to assign delivery partner"
        })

# Performance optimization functions
async def create_orders_indexes(db):
    """Create optimized indexes for orders collection"""
    try:
        # Compound index for common queries
        await db.create_index("orders", [
            ("order_status", 1),
            ("created_at", -1)
        ])
        
        # Index for date range queries
        await db.create_index("orders", [("created_at", -1)])
        
        # Index for amount queries
        await db.create_index("orders", [("total_amount", 1)])
        
        # Index for delivery partner queries
        await db.create_index("orders", [("delivery_partner", 1)])
        
        # Index for user queries (for customer name search)
        await db.create_index("orders", [("user", 1)])
        
        # Text index for order_id search
        await db.create_index("orders", [("order_id", 1)])
        
        logger.info("Orders indexes created successfully")
        
    except Exception as e:
        logger.error(f"Error creating orders indexes: {e}")

async def get_orders_analytics(websocket: WebSocket, filters: dict, db):
    """Get orders analytics for dashboard"""
    try:
        # Build base query
        query = await build_orders_query(filters)
        query = await handle_customer_name_search(query, db)
        
        # Aggregation pipeline for analytics
        pipeline = [
            {"$match": query},
            {
                "$group": {
                    "_id": "$order_status",
                    "count": {"$sum": 1},
                    "total_amount": {"$sum": "$total_amount"},
                    "avg_amount": {"$avg": "$total_amount"}
                }
            }
        ]
        
        analytics = await db.aggregate("orders", pipeline)
        
        await websocket.send_json({
            "type": "orders_analytics",
            "analytics": list(analytics)
        })
        
    except Exception as e:
        logger.error(f"Error getting orders analytics: {e}")
        await websocket.send_json({
            "type": "error",
            "message": "Failed to get orders analytics"
        })

# Update the main send_orders to use the enhanced version
# send_orders = send_orders_enhanced