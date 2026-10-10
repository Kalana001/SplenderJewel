export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          phone1: string | null;
          phone2: string | null;
          avatar_url: string | null;
          account_status: 'active' | 'suspended';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          phone1?: string | null;
          phone2?: string | null;
          avatar_url?: string | null;
          account_status?: 'active' | 'suspended';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          phone1?: string | null;
          phone2?: string | null;
          avatar_url?: string | null;
          account_status?: 'active' | 'suspended';
          created_at?: string;
          updated_at?: string;
        };
      };
      addresses: {
        Row: {
          id: string;
          user_id: string;
          label: string | null;
          full_name: string;
          phone1: string;
          phone2: string | null;
          address_line: string;
          city: string | null;
          district: string;
          province: string | null;
          postal_code: string | null;
          delivery_notes: string | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label?: string | null;
          full_name: string;
          phone1: string;
          phone2?: string | null;
          address_line: string;
          city?: string | null;
          district: string;
          province?: string | null;
          postal_code?: string | null;
          delivery_notes?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          label?: string | null;
          full_name?: string;
          phone1?: string;
          phone2?: string | null;
          address_line?: string;
          city?: string | null;
          district?: string;
          province?: string | null;
          postal_code?: string | null;
          delivery_notes?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      admin_users: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: 'super_admin' | 'admin' | 'staff';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          role?: 'super_admin' | 'admin' | 'staff';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          role?: 'super_admin' | 'admin' | 'staff';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          admin_id: string | null;
          admin_email: string;
          action: string;
          resource_type: string;
          resource_id: string | null;
          details: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id?: string | null;
          admin_email: string;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          details?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string | null;
          admin_email?: string;
          action?: string;
          resource_type?: string;
          resource_id?: string | null;
          details?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          image_url: string | null;
          display_order: number;
          is_active: boolean;
          meta_title: string | null;
          meta_description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          image_url?: string | null;
          display_order?: number;
          is_active?: boolean;
          meta_title?: string | null;
          meta_description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          image_url?: string | null;
          display_order?: number;
          is_active?: boolean;
          meta_title?: string | null;
          meta_description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          name: string;
          slug: string;
          product_code: string | null;
          short_description: string | null;
          description: string | null;
          material: string | null;
          gender: 'women' | 'men' | 'unisex';
          category_id: string | null;
          is_featured: boolean;
          is_new_arrival: boolean;
          is_best_seller: boolean;
          is_active: boolean;
          meta_title: string | null;
          meta_description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          product_code?: string | null;
          short_description?: string | null;
          description?: string | null;
          material?: string | null;
          gender?: 'women' | 'men' | 'unisex';
          category_id?: string | null;
          is_featured?: boolean;
          is_new_arrival?: boolean;
          is_best_seller?: boolean;
          is_active?: boolean;
          meta_title?: string | null;
          meta_description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          product_code?: string | null;
          short_description?: string | null;
          description?: string | null;
          material?: string | null;
          gender?: 'women' | 'men' | 'unisex';
          category_id?: string | null;
          is_featured?: boolean;
          is_new_arrival?: boolean;
          is_best_seller?: boolean;
          is_active?: boolean;
          meta_title?: string | null;
          meta_description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          sku: string;
          title: string;
          attributes: Json;
          price: number;
          discount_price: number | null;
          purchase_cost: number; // ADMIN ONLY
          stock_quantity: number;
          low_stock_threshold: number;
          stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          sku: string;
          title: string;
          attributes?: Json;
          price: number;
          discount_price?: number | null;
          purchase_cost?: number;
          stock_quantity?: number;
          low_stock_threshold?: number;
          stock_status?: 'in_stock' | 'low_stock' | 'out_of_stock';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          sku?: string;
          title?: string;
          attributes?: Json;
          price?: number;
          discount_price?: number | null;
          purchase_cost?: number;
          stock_quantity?: number;
          low_stock_threshold?: number;
          stock_status?: 'in_stock' | 'low_stock' | 'out_of_stock';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      product_images: {
        Row: {
          id: string;
          product_id: string;
          variant_id: string | null;
          url: string;
          alt_text: string | null;
          display_order: number;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          variant_id?: string | null;
          url: string;
          alt_text?: string | null;
          display_order?: number;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          variant_id?: string | null;
          url?: string;
          alt_text?: string | null;
          display_order?: number;
          is_primary?: boolean;
          created_at?: string;
        };
      };
      inventory_movements: {
        Row: {
          id: string;
          variant_id: string;
          quantity_change: number;
          previous_quantity: number;
          new_quantity: number;
          reason: 'stock_added' | 'manual_adjustment' | 'order_sold' | 'order_cancelled_restock' | 'correction';
          reference_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          variant_id: string;
          quantity_change: number;
          previous_quantity: number;
          new_quantity: number;
          reason: 'stock_added' | 'manual_adjustment' | 'order_sold' | 'order_cancelled_restock' | 'correction';
          reference_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          variant_id?: string;
          quantity_change?: number;
          previous_quantity?: number;
          new_quantity?: number;
          reason?: 'stock_added' | 'manual_adjustment' | 'order_sold' | 'order_cancelled_restock' | 'correction';
          reference_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
      };
      carts: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      cart_items: {
        Row: {
          id: string;
          cart_id: string;
          variant_id: string;
          quantity: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cart_id: string;
          variant_id: string;
          quantity?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cart_id?: string;
          variant_id?: string;
          quantity?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      wishlists: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      wishlist_items: {
        Row: {
          id: string;
          wishlist_id: string;
          product_id: string;
          variant_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          wishlist_id: string;
          product_id: string;
          variant_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          wishlist_id?: string;
          product_id?: string;
          variant_id?: string | null;
          created_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          order_token: string;
          user_id: string | null;
          customer_name: string;
          email: string | null;
          phone1: string;
          phone2: string | null;
          address_line: string;
          city: string | null;
          district: string;
          province: string | null;
          postal_code: string | null;
          delivery_notes: string | null;
          delivery_fee: number;
          subtotal: number;
          discount_amount: number;
          coupon_code: string | null;
          total_amount: number;
          payment_method: 'cod' | 'bank_transfer';
          payment_status: 'pending' | 'verified' | 'failed' | 'refunded';
          order_status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
          tracking_number: string | null;
          admin_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_number?: string;
          order_token?: string;
          user_id?: string | null;
          customer_name: string;
          email?: string | null;
          phone1: string;
          phone2?: string | null;
          address_line: string;
          city?: string | null;
          district: string;
          province?: string | null;
          postal_code?: string | null;
          delivery_notes?: string | null;
          delivery_fee?: number;
          subtotal: number;
          discount_amount?: number;
          coupon_code?: string | null;
          total_amount: number;
          payment_method: 'cod' | 'bank_transfer';
          payment_status?: 'pending' | 'verified' | 'failed' | 'refunded';
          order_status?: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
          tracking_number?: string | null;
          admin_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_number?: string;
          order_token?: string;
          user_id?: string | null;
          customer_name?: string;
          email?: string | null;
          phone1?: string;
          phone2?: string | null;
          address_line?: string;
          city?: string | null;
          district?: string;
          province?: string | null;
          postal_code?: string | null;
          delivery_notes?: string | null;
          delivery_fee?: number;
          subtotal?: number;
          discount_amount?: number;
          coupon_code?: string | null;
          total_amount?: number;
          payment_method?: 'cod' | 'bank_transfer';
          payment_status?: 'pending' | 'verified' | 'failed' | 'refunded';
          order_status?: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
          tracking_number?: string | null;
          admin_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          variant_id: string;
          product_name: string;
          variant_title: string;
          sku: string;
          image_url: string | null;
          unit_price: number;
          quantity: number;
          total_price: number;
          purchase_cost: number; // ADMIN ONLY
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          variant_id: string;
          product_name: string;
          variant_title: string;
          sku: string;
          image_url?: string | null;
          unit_price: number;
          quantity: number;
          total_price: number;
          purchase_cost?: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          variant_id?: string;
          product_name?: string;
          variant_title?: string;
          sku?: string;
          image_url?: string | null;
          unit_price?: number;
          quantity?: number;
          total_price?: number;
          purchase_cost?: number;
        };
      };
      order_status_history: {
        Row: {
          id: string;
          order_id: string;
          previous_status: string | null;
          new_status: string;
          changed_by: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          previous_status?: string | null;
          new_status: string;
          changed_by?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          previous_status?: string | null;
          new_status?: string;
          changed_by?: string | null;
          notes?: string | null;
          created_at?: string;
        };
      };
      payments: {
        Row: {
          id: string;
          order_id: string;
          payment_method: 'cod' | 'bank_transfer';
          amount: number;
          status: 'pending' | 'verified' | 'failed' | 'refunded';
          reference_number: string | null;
          approved_by: string | null;
          approved_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          payment_method: 'cod' | 'bank_transfer';
          amount: number;
          status?: 'pending' | 'verified' | 'failed' | 'refunded';
          reference_number?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          payment_method?: 'cod' | 'bank_transfer';
          amount?: number;
          status?: 'pending' | 'verified' | 'failed' | 'refunded';
          reference_number?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      coupons: {
        Row: {
          id: string;
          code: string;
          discount_type: 'percentage' | 'fixed';
          discount_value: number;
          min_order_amount: number;
          max_discount_amount: number | null;
          total_usage_limit: number | null;
          per_customer_limit: number | null;
          start_date: string | null;
          end_date: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          discount_type: 'percentage' | 'fixed';
          discount_value: number;
          min_order_amount?: number;
          max_discount_amount?: number | null;
          total_usage_limit?: number | null;
          per_customer_limit?: number | null;
          start_date?: string | null;
          end_date?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          discount_type?: 'percentage' | 'fixed';
          discount_value?: number;
          min_order_amount?: number;
          max_discount_amount?: number | null;
          total_usage_limit?: number | null;
          per_customer_limit?: number | null;
          start_date?: string | null;
          end_date?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      coupon_usage: {
        Row: {
          id: string;
          coupon_id: string;
          order_id: string;
          user_id: string | null;
          discount_amount: number;
          used_at: string;
        };
        Insert: {
          id?: string;
          coupon_id: string;
          order_id: string;
          user_id?: string | null;
          discount_amount: number;
          used_at?: string;
        };
        Update: {
          id?: string;
          coupon_id?: string;
          order_id?: string;
          user_id?: string | null;
          discount_amount?: number;
          used_at?: string;
        };
      };
      reviews: {
        Row: {
          id: string;
          product_id: string;
          variant_id: string | null;
          order_id: string;
          order_item_id: string;
          user_id: string | null;
          customer_name: string;
          rating: number;
          title: string | null;
          comment: string | null;
          is_verified_purchase: boolean;
          is_approved: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          variant_id?: string | null;
          order_id: string;
          order_item_id: string;
          user_id?: string | null;
          customer_name: string;
          rating: number;
          title?: string | null;
          comment?: string | null;
          is_verified_purchase?: boolean;
          is_approved?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          variant_id?: string | null;
          order_id?: string;
          order_item_id?: string;
          user_id?: string | null;
          customer_name?: string;
          rating?: number;
          title?: string | null;
          comment?: string | null;
          is_verified_purchase?: boolean;
          is_approved?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      store_settings: {
        Row: {
          id: string;
          key: string;
          value: Json;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          value: Json;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          value?: Json;
          updated_at?: string;
        };
      };
      delivery_districts: {
        Row: {
          id: string;
          name: string;
          province: string;
          delivery_fee: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          province: string;
          delivery_fee?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          province?: string;
          delivery_fee?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      homepage_sections: {
        Row: {
          id: string;
          section_key: string;
          title: string | null;
          subtitle: string | null;
          display_order: number;
          is_enabled: boolean;
          config_data: Json;
          updated_at: string;
        };
        Insert: {
          id?: string;
          section_key: string;
          title?: string | null;
          subtitle?: string | null;
          display_order?: number;
          is_enabled?: boolean;
          config_data?: Json;
          updated_at?: string;
        };
        Update: {
          id?: string;
          section_key?: string;
          title?: string | null;
          subtitle?: string | null;
          display_order?: number;
          is_enabled?: boolean;
          config_data?: Json;
          updated_at?: string;
        };
      };
      banners: {
        Row: {
          id: string;
          title: string;
          subtitle: string | null;
          image_url: string;
          mobile_image_url: string | null;
          link_url: string | null;
          button_text: string | null;
          display_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          subtitle?: string | null;
          image_url: string;
          mobile_image_url?: string | null;
          link_url?: string | null;
          button_text?: string | null;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          subtitle?: string | null;
          image_url?: string;
          mobile_image_url?: string | null;
          link_url?: string | null;
          button_text?: string | null;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      content_pages: {
        Row: {
          id: string;
          slug: string;
          title: string;
          content: string;
          meta_title: string | null;
          meta_description: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          content?: string;
          meta_title?: string | null;
          meta_description?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          title?: string;
          content?: string;
          meta_title?: string | null;
          meta_description?: string | null;
          updated_at?: string;
        };
      };
      print_templates: {
        Row: {
          id: string;
          name: string;
          is_default: boolean;
          template_config: Json;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          is_default?: boolean;
          template_config: Json;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          is_default?: boolean;
          template_config?: Json;
          updated_at?: string;
        };
      };
    };
    Views: {
      public_product_variants: {
        Row: {
          id: string;
          product_id: string;
          sku: string;
          title: string;
          attributes: Json;
          price: number;
          discount_price: number | null;
          stock_quantity: number;
          low_stock_threshold: number;
          stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
      };
    };
    Functions: {
      generate_order_number: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
