export interface BloodResults {
  wbc?: number | null;
  hgb?: number | null;
  plt?: number | null;
  anc?: number | null;
  mono?: number | null;
  cre?: number | null;
  egfr?: number | null;
  ast?: number | null;
  alt?: number | null;
  tbil?: number | null;
  crp?: number | null;
  ca?: number | null;
  mg?: number | null;
  up?: number | null;
  upcr?: number | null;
}

export interface StartCriteriaAlertItem {
  metric_key: string;
  comparator: string;
  threshold_value: number;
  threshold_unit: string | null;
  current_value: number | null;
  criterion_text: string;
}

export type TreatmentStatus = 'pending' | 'done' | 'changed' | 'cancelled';
export type PrescriptionType = '緊急' | '院内' | '院外' | null;

export interface Treatment extends BloodResults {
  id: number;
  scheduled_date: string;
  scheduled_time: string | null;       // 投与開始時間 (09:30:00 形式)
  status: TreatmentStatus;
  status_changed_at: string | null;
  status_note: string | null;
  memo: string | null;
  prescription_received: boolean;
  prescription_type: PrescriptionType; // 緊急/院内/院外
  prescription_info: string | null;    // 処方詳細（EMR連携後に設定）
  patient_no: string;
  patient_name: string;
  patient_comment?: string | null;
  furigana: string | null;             // ふりがな
  department: string;
  doctor: string;
  diagnosis: string;
  regimen_name: string;
  has_start_criteria_warning?: boolean;
  start_criteria_warning_count?: number;
  start_criteria_alerts?: StartCriteriaAlertItem[];
  pre_consultation_this_month: number; // 当月の診察前面談算定回数
  treatment_category: '注射' | '内服';  // 注射/内服区分（デフォルト: 注射）
}

export interface Intervention {
  id?: number;
  treatment_id: number;
  record_id?: string;
  recorded_at?: string;
  intervention_type: '提案' | '疑義' | '問い合わせ' | '';
  consultation_timing: '前' | '後' | '';
  calc_cancer_guidance: boolean;
  calc_pre_consultation: boolean;
  intervention_category: string;
  intervention_detail: string;
  intervention_content: string;
  pharmacist_name: string;
  memo: string;
  prescription_changed: boolean;
  proxy_prescription: boolean;
  case_candidate: boolean;
  drug_route: '注射' | '内服';
}
