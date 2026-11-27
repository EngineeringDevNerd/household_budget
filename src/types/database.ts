
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "accounts": {
                  Row: {
                    "card_numbers": string[],"created_at": string,"id": string,"is_active": boolean,"name": string,"opening_balance_cents": number,"opening_balance_date": string,"sort_order": number,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "card_numbers"?: string[],"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"opening_balance_cents"?: number,"opening_balance_date"?: string,"sort_order"?: number,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "card_numbers"?: string[],"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"opening_balance_cents"?: number,"opening_balance_date"?: string,"sort_order"?: number,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"bill_instances": {
                  Row: {
                    "amount_cents": number,"bill_month": string,"category_id": string | null,"created_at": string,"due_date": string,"generated_for_paycheck_id": string | null,"id": string,"name": string,"notes": string | null,"paid_date": string | null,"paycheck_id": string | null,"recurring_bill_id": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"bill_month": string,"category_id"?: string | null,"created_at"?: string,"due_date": string,"generated_for_paycheck_id"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"paid_date"?: string | null,"paycheck_id"?: string | null,"recurring_bill_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"bill_month"?: string,"category_id"?: string | null,"created_at"?: string,"due_date"?: string,"generated_for_paycheck_id"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"paid_date"?: string | null,"paycheck_id"?: string | null,"recurring_bill_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bill_instances_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bill_instances_generated_for_paycheck_id_fkey"
      columns: ["generated_for_paycheck_id"]
isOneToOne: false
      referencedRelation: "paychecks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bill_instances_paycheck_id_fkey"
      columns: ["paycheck_id"]
isOneToOne: false
      referencedRelation: "paychecks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bill_instances_recurring_bill_id_fkey"
      columns: ["recurring_bill_id"]
isOneToOne: false
      referencedRelation: "recurring_bills"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "created_at": string,"group_name": string | null,"id": string,"is_active": boolean,"kind": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"group_name"?: string | null,"id"?: string,"is_active"?: boolean,"kind": string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"group_name"?: string | null,"id"?: string,"is_active"?: boolean,"kind"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"household_members": {
                  Row: {
                    "created_at": string,"display_name": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pay_schedules": {
                  Row: {
                    "anchor_date": string | null,"covers_bills": boolean,"created_at": string,"default_amount_cents": number,"deposit_account_id": string | null,"frequency": string,"id": string,"is_active": boolean,"name": string,"owner_user_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anchor_date"?: string | null,"covers_bills"?: boolean,"created_at"?: string,"default_amount_cents"?: number,"deposit_account_id"?: string | null,"frequency": string,"id"?: string,"is_active"?: boolean,"name": string,"owner_user_id": string,"updated_at"?: string
                  }
                  Update: {
                    "anchor_date"?: string | null,"covers_bills"?: boolean,"created_at"?: string,"default_amount_cents"?: number,"deposit_account_id"?: string | null,"frequency"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"owner_user_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pay_schedules_deposit_account_id_fkey"
      columns: ["deposit_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pay_schedules_owner_user_id_fkey"
      columns: ["owner_user_id"]
isOneToOne: false
      referencedRelation: "household_members"
      referencedColumns: ["user_id"]
    }
                  ]
                },"paychecks": {
                  Row: {
                    "actual_amount_cents": number | null,"created_at": string,"expected_amount_cents": number,"id": string,"notes": string | null,"pay_date": string,"pay_schedule_id": string,"received_on": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actual_amount_cents"?: number | null,"created_at"?: string,"expected_amount_cents": number,"id"?: string,"notes"?: string | null,"pay_date": string,"pay_schedule_id": string,"received_on"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "actual_amount_cents"?: number | null,"created_at"?: string,"expected_amount_cents"?: number,"id"?: string,"notes"?: string | null,"pay_date"?: string,"pay_schedule_id"?: string,"received_on"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "paychecks_pay_schedule_id_fkey"
      columns: ["pay_schedule_id"]
isOneToOne: false
      referencedRelation: "pay_schedules"
      referencedColumns: ["id"]
    }
                  ]
                },"recurring_bills": {
                  Row: {
                    "category_id": string | null,"created_at": string,"default_account_id": string | null,"default_amount_cents": number,"due_day": number | null,"frequency": string,"id": string,"is_active": boolean,"is_variable": boolean,"last_account_id": string | null,"name": string,"notes": string | null,"pay_from": string,"pay_schedule_id": string | null,"transfer_to_account_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"created_at"?: string,"default_account_id"?: string | null,"default_amount_cents": number,"due_day"?: number | null,"frequency"?: string,"id"?: string,"is_active"?: boolean,"is_variable"?: boolean,"last_account_id"?: string | null,"name": string,"notes"?: string | null,"pay_from"?: string,"pay_schedule_id"?: string | null,"transfer_to_account_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string | null,"created_at"?: string,"default_account_id"?: string | null,"default_amount_cents"?: number,"due_day"?: number | null,"frequency"?: string,"id"?: string,"is_active"?: boolean,"is_variable"?: boolean,"last_account_id"?: string | null,"name"?: string,"notes"?: string | null,"pay_from"?: string,"pay_schedule_id"?: string | null,"transfer_to_account_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recurring_bills_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_bills_default_account_id_fkey"
      columns: ["default_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_bills_last_account_id_fkey"
      columns: ["last_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_bills_pay_schedule_id_fkey"
      columns: ["pay_schedule_id"]
isOneToOne: false
      referencedRelation: "pay_schedules"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_bills_transfer_to_account_id_fkey"
      columns: ["transfer_to_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"import_batches": {
                  Row: {
                    "created_at": string,"created_by": string | null,"file_name": string,"format": string,"id": string,"inserted_count": number,"row_count": number,"statement_total_cents": number | null,"total_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"file_name": string,"format": string,"id"?: string,"inserted_count"?: number,"row_count"?: number,"statement_total_cents"?: number | null,"total_cents"?: number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"file_name"?: string,"format"?: string,"id"?: string,"inserted_count"?: number,"row_count"?: number,"statement_total_cents"?: number | null,"total_cents"?: number
                  }
                  Relationships: [
                    
                  ]
                },"transactions": {
                  Row: {
                    "account_id": string,"amount_cents": number,"bank_category": string | null,"bill_instance_id": string | null,"category_id": string | null,"created_at": string,"created_by": string | null,"id": string,"import_batch_id": string | null,"import_hash": string | null,"notes": string | null,"original_description": string | null,"payee": string | null,"source": string,"transfer_group_id": string | null,"txn_date": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount_cents": number,"bank_category"?: string | null,"bill_instance_id"?: string | null,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"import_batch_id"?: string | null,"import_hash"?: string | null,"notes"?: string | null,"original_description"?: string | null,"payee"?: string | null,"source"?: string,"transfer_group_id"?: string | null,"txn_date": string,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"amount_cents"?: number,"bank_category"?: string | null,"bill_instance_id"?: string | null,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"import_batch_id"?: string | null,"import_hash"?: string | null,"notes"?: string | null,"original_description"?: string | null,"payee"?: string | null,"source"?: string,"transfer_group_id"?: string | null,"txn_date"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_bill_instance_id_fkey"
      columns: ["bill_instance_id"]
isOneToOne: true
      referencedRelation: "bill_instances"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "account_balances": {
                  Row: {
                    "balance_cents": number,"id": string,"is_active": boolean,"name": string,"opening_balance_cents": number,"opening_balance_date": string,"sort_order": number,"type": string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "generate_month":
{ Args: { "p_month": string }; Returns: number
                           },
"generate_paychecks":
{ Args: { "p_through": string }; Returns: number
                           },
"import_transactions":
{ Args: { "p_file_name": string,"p_format": string,"p_rows": Json,"p_statement_total_cents": number | null }; Returns: Json
                           },
"mark_bill_paid":
{ Args: { "p_account_id": string,"p_amount_cents": number,"p_bill_instance_id": string,"p_category_id"?: string,"p_paid_date": string }; Returns: string
                           },
"delete_transaction":
{ Args: { "p_transaction_id": string }; Returns: undefined
                           },
"undo_import":
{ Args: { "p_batch_id": string }; Returns: number
                           },
"unmark_bill_paid":
{ Args: { "p_bill_instance_id": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
