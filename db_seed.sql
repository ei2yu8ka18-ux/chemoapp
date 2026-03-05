--
-- PostgreSQL database dump
--

\restrict 6L4oWqTAcr8mLehBYQF2XgvVjvg3KiQbrTylfry1gzspEmU8BExFjdat3V7BfjE

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auth_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_logs (
    id integer NOT NULL,
    user_id integer NOT NULL,
    action character varying(20) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: auth_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auth_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auth_logs_id_seq OWNED BY public.auth_logs.id;


--
-- Name: blood_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blood_results (
    id integer NOT NULL,
    treatment_id integer,
    wbc numeric,
    hgb numeric,
    plt numeric,
    anc numeric,
    mono numeric,
    cre numeric,
    egfr numeric,
    ast numeric,
    alt numeric,
    tbil numeric,
    crp numeric,
    ca numeric,
    mg numeric,
    up numeric,
    upcr numeric,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: blood_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blood_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blood_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blood_results_id_seq OWNED BY public.blood_results.id;


--
-- Name: daily_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_reports (
    id integer NOT NULL,
    report_date date NOT NULL,
    total_patients integer DEFAULT 0,
    completed_treatments integer DEFAULT 0,
    denied_treatments integer DEFAULT 0,
    guidance_count integer DEFAULT 0,
    summary text,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: daily_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.daily_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: daily_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.daily_reports_id_seq OWNED BY public.daily_reports.id;


--
-- Name: dose_check_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dose_check_records (
    id integer NOT NULL,
    patient_id character varying(50) NOT NULL,
    check_date date NOT NULL,
    checked_by integer NOT NULL,
    body_weight numeric(5,1),
    body_surface_area numeric(4,2),
    regimen_name character varying(200),
    calculated_dose jsonb,
    prescribed_dose jsonb,
    check_result character varying(20),
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dose_check_records_check_result_check CHECK (((check_result)::text = ANY ((ARRAY['ok'::character varying, 'warning'::character varying, 'alert'::character varying])::text[])))
);


--
-- Name: dose_check_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dose_check_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dose_check_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dose_check_records_id_seq OWNED BY public.dose_check_records.id;


--
-- Name: interventions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interventions (
    id integer NOT NULL,
    treatment_id integer,
    record_id character varying(50) NOT NULL,
    recorded_at timestamp with time zone DEFAULT now(),
    intervention_type character varying(20),
    consultation_timing character varying(5),
    calc_cancer_guidance boolean DEFAULT false,
    calc_pre_consultation boolean DEFAULT false,
    intervention_category character varying(50),
    intervention_detail character varying(50),
    intervention_content text,
    pharmacist_name character varying(50),
    memo text,
    prescription_changed boolean DEFAULT false,
    proxy_prescription boolean DEFAULT false,
    case_candidate boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    drug_route character varying(10),
    CONSTRAINT interventions_consultation_timing_check CHECK (((consultation_timing)::text = ANY ((ARRAY['前'::character varying, '後'::character varying])::text[]))),
    CONSTRAINT interventions_intervention_type_check CHECK (((intervention_type)::text = ANY ((ARRAY['提案'::character varying, '疑義'::character varying, '問い合わせ'::character varying])::text[])))
);


--
-- Name: interventions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.interventions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: interventions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.interventions_id_seq OWNED BY public.interventions.id;


--
-- Name: medication_guidance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medication_guidance (
    id integer NOT NULL,
    patient_id character varying(50) NOT NULL,
    treatment_record_id integer,
    guidance_date date NOT NULL,
    pharmacist_id integer NOT NULL,
    guidance_content text NOT NULL,
    patient_understanding character varying(20),
    side_effects_reported text,
    next_guidance_notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: medication_guidance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medication_guidance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medication_guidance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medication_guidance_id_seq OWNED BY public.medication_guidance.id;


--
-- Name: patients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patients (
    id integer NOT NULL,
    patient_no character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    department character varying(50),
    doctor character varying(50),
    diagnosis text,
    created_at timestamp with time zone DEFAULT now(),
    furigana character varying(100)
);


--
-- Name: patients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.patients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: patients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.patients_id_seq OWNED BY public.patients.id;


--
-- Name: regimens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regimens (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: regimens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.regimens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: regimens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.regimens_id_seq OWNED BY public.regimens.id;


--
-- Name: scheduled_treatments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_treatments (
    id integer NOT NULL,
    scheduled_date date NOT NULL,
    patient_id integer,
    regimen_id integer,
    status character varying(20) DEFAULT 'pending'::character varying,
    memo text,
    prescription_received boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    status_changed_at timestamp with time zone,
    status_note text,
    scheduled_time time without time zone,
    prescription_type character varying(20),
    prescription_info text
);


--
-- Name: scheduled_treatments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scheduled_treatments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scheduled_treatments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scheduled_treatments_id_seq OWNED BY public.scheduled_treatments.id;


--
-- Name: treatment_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_records (
    id integer NOT NULL,
    patient_id character varying(50) NOT NULL,
    treatment_date date NOT NULL,
    regimen_name character varying(200),
    cycle_number integer,
    day_number integer,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    status_reason text,
    approved_by integer,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT treatment_records_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'denied'::character varying, 'modified'::character varying, 'completed'::character varying])::text[])))
);


--
-- Name: treatment_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.treatment_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: treatment_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.treatment_records_id_seq OWNED BY public.treatment_records.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    display_name character varying(100) NOT NULL,
    role character varying(20) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    employee_no character varying(20),
    primary_days smallint[] DEFAULT '{}'::smallint[],
    secondary_days smallint[] DEFAULT '{}'::smallint[],
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['pharmacist'::character varying, 'admin'::character varying])::text[])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: work_diaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_diaries (
    id integer NOT NULL,
    diary_date date NOT NULL,
    patient_counseling integer DEFAULT 0,
    first_visit_counseling integer DEFAULT 0,
    allergy_stop integer DEFAULT 0,
    regimen_check integer DEFAULT 0,
    regimen_operation integer DEFAULT 0,
    oral_scheduled integer DEFAULT 0,
    oral_done integer DEFAULT 0,
    oral_cancelled integer DEFAULT 0,
    oral_changed integer DEFAULT 0,
    oral_patient_counseling integer DEFAULT 0,
    oral_first_visit integer DEFAULT 0,
    oral_doubt integer DEFAULT 0,
    oral_propose integer DEFAULT 0,
    oral_inquiry integer DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: work_diaries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.work_diaries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: work_diaries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.work_diaries_id_seq OWNED BY public.work_diaries.id;


--
-- Name: work_diary_pharmacists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_diary_pharmacists (
    id integer NOT NULL,
    diary_id integer,
    sort_order smallint DEFAULT 0,
    pharmacist_name character varying(50),
    start_time character varying(5),
    end_time character varying(5),
    has_lunch boolean DEFAULT false,
    lunch_minutes integer DEFAULT 60
);


--
-- Name: work_diary_pharmacists_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.work_diary_pharmacists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: work_diary_pharmacists_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.work_diary_pharmacists_id_seq OWNED BY public.work_diary_pharmacists.id;


--
-- Name: auth_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_logs ALTER COLUMN id SET DEFAULT nextval('public.auth_logs_id_seq'::regclass);


--
-- Name: blood_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_results ALTER COLUMN id SET DEFAULT nextval('public.blood_results_id_seq'::regclass);


--
-- Name: daily_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_reports ALTER COLUMN id SET DEFAULT nextval('public.daily_reports_id_seq'::regclass);


--
-- Name: dose_check_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dose_check_records ALTER COLUMN id SET DEFAULT nextval('public.dose_check_records_id_seq'::regclass);


--
-- Name: interventions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interventions ALTER COLUMN id SET DEFAULT nextval('public.interventions_id_seq'::regclass);


--
-- Name: medication_guidance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_guidance ALTER COLUMN id SET DEFAULT nextval('public.medication_guidance_id_seq'::regclass);


--
-- Name: patients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients ALTER COLUMN id SET DEFAULT nextval('public.patients_id_seq'::regclass);


--
-- Name: regimens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regimens ALTER COLUMN id SET DEFAULT nextval('public.regimens_id_seq'::regclass);


--
-- Name: scheduled_treatments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_treatments ALTER COLUMN id SET DEFAULT nextval('public.scheduled_treatments_id_seq'::regclass);


--
-- Name: treatment_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_records ALTER COLUMN id SET DEFAULT nextval('public.treatment_records_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: work_diaries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_diaries ALTER COLUMN id SET DEFAULT nextval('public.work_diaries_id_seq'::regclass);


--
-- Name: work_diary_pharmacists id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_diary_pharmacists ALTER COLUMN id SET DEFAULT nextval('public.work_diary_pharmacists_id_seq'::regclass);


--
-- Data for Name: auth_logs; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.auth_logs (id, user_id, action, created_at) VALUES
	(1, 1, 'login', '2026-03-05 13:50:29.867362+09'),
	(2, 13, 'login', '2026-03-05 16:49:13.544266+09'),
	(3, 1, 'login', '2026-03-05 16:50:15.141933+09');


--
-- Data for Name: blood_results; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.blood_results (id, treatment_id, wbc, hgb, plt, anc, mono, cre, egfr, ast, alt, tbil, crp, ca, mg, up, upcr, updated_at) VALUES
	(1, 5, NULL, 52, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-05 11:30:02.132996+09'),
	(4, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 44, NULL, NULL, NULL, '2026-03-05 11:30:06.907748+09'),
	(6, 1, 1000, NULL, 5, NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-05 11:30:27.899605+09');


--
-- Data for Name: daily_reports; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: dose_check_records; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: interventions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.interventions (id, treatment_id, record_id, recorded_at, intervention_type, consultation_timing, calc_cancer_guidance, calc_pre_consultation, intervention_category, intervention_detail, intervention_content, pharmacist_name, memo, prescription_changed, proxy_prescription, case_candidate, created_at, drug_route) VALUES
	(1, 1, '20260305-111411', '2026-03-05 11:14:37.331393+09', '問い合わせ', '前', false, false, 'オピオイド', '内分泌系', NULL, '岩根', NULL, true, true, false, '2026-03-05 11:14:37.331393+09', 'CE8C04'),
	(2, 2, '20260305-113050', '2026-03-05 11:31:00.201872+09', NULL, NULL, true, true, NULL, '皮膚科系', NULL, '古田', NULL, false, false, true, '2026-03-05 11:31:00.201872+09', 'CE8C04'),
	(3, 3, '20260305132832-3062676', '2026-03-05 13:28:37.79138+09', NULL, NULL, false, false, 'オピオイド', '内分泌系', 'aaa', '岩根', NULL, false, false, false, '2026-03-05 13:28:37.79138+09', 'CE8C04'),
	(4, 4, '20260305134358-3084969', '2026-03-05 13:44:18.109723+09', NULL, '後', true, true, '抗がん剤用量調節', NULL, 'あああ', '塩飽英二', NULL, false, false, false, '2026-03-05 13:44:18.109723+09', 'CE8C04');


--
-- Data for Name: medication_guidance; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: patients; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.patients (id, patient_no, name, department, doctor, diagnosis, created_at, furigana) VALUES
	(1, '1797323', '山下 ソノ子', '消化内', '黄', '膵Carの疑い', '2026-03-05 08:33:03.061496+09', 'やました そのこ'),
	(2, '2400687', '木戸 直子', '乳腺科', '西江', '大腸腺腫', '2026-03-05 08:33:03.061496+09', 'きど なおこ'),
	(3, '3062676', '前川 博', '泌尿器', '山口', '', '2026-03-05 08:33:03.061496+09', 'まえかわ ひろし'),
	(4, '3084969', '吉田 美紀', '乳腺科', '安田', '', '2026-03-05 08:33:03.061496+09', 'よしだ みき'),
	(5, '3340072', '山下 より子', '腫瘍内', '山口', 'Meta性肺腫瘍', '2026-03-05 08:33:03.061496+09', 'やました よりこ'),
	(6, '3608130', '堀越 渡', 'リウマチ', '三崎', '', '2026-03-05 08:33:03.061496+09', 'ほりこし わたる'),
	(7, '3643921', '前田 太一', '泌尿器', '山口', '前立腺Carの疑い', '2026-03-05 08:33:03.061496+09', 'まえだ たいち');


--
-- Data for Name: regimens; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.regimens (id, name, description, created_at) VALUES
	(1, 'オキバイド+5FU/LV', NULL, '2026-03-05 08:33:03.053192+09'),
	(2, 'weeklyPAC', NULL, '2026-03-05 08:33:03.053192+09'),
	(3, 'パドセブ', NULL, '2026-03-05 08:33:03.053192+09'),
	(4, 'フェスゴ+DTX', NULL, '2026-03-05 08:33:03.053192+09'),
	(5, 'BV+FOLFIRI', NULL, '2026-03-05 08:33:03.053192+09'),
	(6, 'アクテムラ', NULL, '2026-03-05 08:33:03.053192+09'),
	(7, 'DTX', NULL, '2026-03-05 08:33:03.053192+09');


--
-- Data for Name: scheduled_treatments; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.scheduled_treatments (id, scheduled_date, patient_id, regimen_id, status, memo, prescription_received, created_at, updated_at, status_changed_at, status_note, scheduled_time, prescription_type, prescription_info) VALUES
	(6, '2026-03-05', 6, 6, 'cancelled', NULL, false, '2026-03-05 08:33:03.063285+09', '2026-03-05 10:55:25.524958+09', '2026-03-05 10:55:25.524958+09', 'acc', '13:00:00', '院内', NULL),
	(5, '2026-03-05', 5, 5, 'changed', NULL, false, '2026-03-05 08:33:03.063285+09', '2026-03-05 16:27:12.86429+09', '2026-03-05 16:27:12.86429+09', '好中球減少', '11:30:00', '院外', NULL),
	(7, '2026-03-05', 7, 7, 'pending', NULL, false, '2026-03-05 08:33:03.063285+09', '2026-03-05 18:15:15.110349+09', '2026-03-05 18:15:15.110349+09', NULL, '13:00:00', NULL, NULL),
	(4, '2026-03-05', 4, 4, 'pending', NULL, false, '2026-03-05 08:33:03.063285+09', '2026-03-05 18:43:46.924972+09', '2026-03-05 18:43:46.924972+09', '本人都合', '11:30:00', '院内', NULL),
	(3, '2026-03-05', 3, 3, 'pending', 'test', false, '2026-03-05 08:33:03.063285+09', '2026-03-05 18:43:49.139478+09', '2026-03-05 18:43:49.139478+09', '本人都合', '09:30:00', '緊急', NULL),
	(2, '2026-03-05', 2, 2, 'pending', 'aaaaa', false, '2026-03-05 08:33:03.063285+09', '2026-03-05 18:43:50.614283+09', '2026-03-05 18:43:50.614283+09', NULL, '09:30:00', '院外', NULL),
	(1, '2026-03-05', 1, 1, 'pending', NULL, false, '2026-03-05 08:33:03.063285+09', '2026-03-05 18:43:51.332113+09', '2026-03-05 18:43:51.332113+09', NULL, '09:30:00', '院内', NULL);


--
-- Data for Name: treatment_records; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.treatment_records (id, patient_id, treatment_date, regimen_name, cycle_number, day_number, status, status_reason, approved_by, notes, created_at, updated_at) VALUES
	(1, 'P001', '2026-03-04', 'FOLFOX6', 4, 1, 'pending', NULL, NULL, NULL, '2026-03-04 09:27:47.168908', '2026-03-04 09:27:47.168908'),
	(2, 'P002', '2026-03-04', 'TC療法', 3, 1, 'pending', NULL, NULL, NULL, '2026-03-04 09:27:47.175445', '2026-03-04 09:27:47.175445'),
	(3, 'P003', '2026-03-04', 'ABVD療法', 2, 1, 'approved', NULL, NULL, NULL, '2026-03-04 09:27:47.177414', '2026-03-04 09:27:47.177414'),
	(4, 'P004', '2026-03-04', 'AC療法', 2, 1, 'pending', NULL, NULL, NULL, '2026-03-04 09:27:47.179486', '2026-03-04 09:27:47.179486'),
	(5, 'P005', '2026-03-04', 'GEM+nabPTX', 5, 1, 'denied', NULL, NULL, NULL, '2026-03-04 09:27:47.181373', '2026-03-04 09:27:47.181373'),
	(6, 'P001', '2026-03-04', 'FOLFOX6', 4, 1, 'pending', NULL, NULL, NULL, '2026-03-04 09:35:51.069933', '2026-03-04 09:35:51.069933'),
	(7, 'P002', '2026-03-04', 'TC療法', 3, 1, 'pending', NULL, NULL, NULL, '2026-03-04 09:35:51.075158', '2026-03-04 09:35:51.075158'),
	(8, 'P003', '2026-03-04', 'ABVD療法', 2, 1, 'approved', NULL, NULL, NULL, '2026-03-04 09:35:51.076204', '2026-03-04 09:35:51.076204'),
	(9, 'P004', '2026-03-04', 'AC療法', 2, 1, 'pending', NULL, NULL, NULL, '2026-03-04 09:35:51.077281', '2026-03-04 09:35:51.077281'),
	(10, 'P005', '2026-03-04', 'GEM+nabPTX', 5, 1, 'denied', NULL, NULL, NULL, '2026-03-04 09:35:51.078359', '2026-03-04 09:35:51.078359'),
	(11, 'P001', '2026-03-04', 'FOLFOX6', 4, 1, 'pending', NULL, NULL, NULL, '2026-03-04 16:48:02.764689', '2026-03-04 16:48:02.764689'),
	(12, 'P002', '2026-03-04', 'TC療法', 3, 1, 'pending', NULL, NULL, NULL, '2026-03-04 16:48:02.783469', '2026-03-04 16:48:02.783469'),
	(13, 'P003', '2026-03-04', 'ABVD療法', 2, 1, 'approved', NULL, NULL, NULL, '2026-03-04 16:48:02.785014', '2026-03-04 16:48:02.785014'),
	(14, 'P004', '2026-03-04', 'AC療法', 2, 1, 'pending', NULL, NULL, NULL, '2026-03-04 16:48:02.786509', '2026-03-04 16:48:02.786509'),
	(15, 'P005', '2026-03-04', 'GEM+nabPTX', 5, 1, 'denied', NULL, NULL, NULL, '2026-03-04 16:48:02.787866', '2026-03-04 16:48:02.787866'),
	(16, 'P001', '2026-03-04', 'FOLFOX6', 4, 1, 'pending', NULL, NULL, NULL, '2026-03-04 16:49:25.445687', '2026-03-04 16:49:25.445687'),
	(17, 'P002', '2026-03-04', 'TC療法', 3, 1, 'pending', NULL, NULL, NULL, '2026-03-04 16:49:25.451955', '2026-03-04 16:49:25.451955'),
	(18, 'P003', '2026-03-04', 'ABVD療法', 2, 1, 'approved', NULL, NULL, NULL, '2026-03-04 16:49:25.453557', '2026-03-04 16:49:25.453557'),
	(19, 'P004', '2026-03-04', 'AC療法', 2, 1, 'pending', NULL, NULL, NULL, '2026-03-04 16:49:25.455761', '2026-03-04 16:49:25.455761'),
	(20, 'P005', '2026-03-04', 'GEM+nabPTX', 5, 1, 'denied', NULL, NULL, NULL, '2026-03-04 16:49:25.458013', '2026-03-04 16:49:25.458013');


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.users (id, username, password_hash, display_name, role, is_active, created_at, updated_at, employee_no, primary_days, secondary_days) VALUES
	(3, 'tanaka', '$2a$10$hYpdZJ5nIan9yAi/2TrU5.Olbw6YKNcdtTV.XgPJJZMZPJP.NLRE2', '田中 薬剤師', 'pharmacist', false, '2026-03-04 09:27:47.167175', '2026-03-05 13:26:08.026857', NULL, '{}', '{}'),
	(1, 'admin', '$2a$10$bwAnTNBObfq0WeZ.s2Qlc.ps2z1GwrcYm.xX5LRqSFywtGhb4ZP9K', '管理者', 'admin', true, '2026-03-04 09:27:47.139211', '2026-03-05 13:26:10.660624', '5806', '{1}', '{2}'),
	(2, 'yamamoto', '$2a$10$lhp6WB6vib5DxiftGYyDDuszW4RqsX0mU4wrzbH.d5X5l7DfACrny', 'shiwakueiji', 'pharmacist', false, '2026-03-04 09:27:47.164612', '2026-03-05 13:43:21.260439', NULL, '{1}', '{2,3}'),
	(13, '5806', '$2a$10$0vw96ovOvUXY5U0jTvOHAe3BCcLguo5te8Yu9oLp3dopOsBYc64ga', '塩飽英二', 'pharmacist', true, '2026-03-05 13:43:43.352286', '2026-03-05 13:43:43.352286', '5806', '{2}', '{5}'),
	(14, '3480', '$2a$10$3KHGhzQrKQ0HCH1N9weuE..DR7tACfzMmwvLIeyoWrU0rPEiaNYh.', '岩根裕紀', 'pharmacist', true, '2026-03-05 14:29:36.312155', '2026-03-05 14:29:36.312155', '3480', '{}', '{}'),
	(15, '5095', '$2a$10$C.BUtoYNXnC0B86sHuAIm.IAMV9MWuml8q3/bGvAPiYyhzHuzqKIC', '古田祐美子', 'pharmacist', true, '2026-03-05 14:29:50.791297', '2026-03-05 14:29:50.791297', '5095', '{}', '{}'),
	(16, '5366', '$2a$10$ETawVl5wtdU.z0iqptSuOeEtvVYWP8wST470WizhYzh9O0P.TAULi', '澤井麻記', 'pharmacist', true, '2026-03-05 14:30:04.716206', '2026-03-05 14:30:04.716206', '5366', '{}', '{}'),
	(18, '6342', '$2a$10$kephhZRctcLIUQsK9g9/FeGB05keczFulOF8dKtip8DEJrn9S4dme', '奥野雅樹', 'pharmacist', true, '2026-03-05 14:30:28.68425', '2026-03-05 14:30:28.68425', '6342', '{}', '{}'),
	(19, '6645', '$2a$10$JdAGaC7N.l0KmrPX1qplbOu1V7UothI7zitQb6Y5tYIIT/U9pXhVm', '冨士原あゆみ', 'pharmacist', true, '2026-03-05 14:30:37.21688', '2026-03-05 14:30:37.21688', '6645', '{}', '{}'),
	(20, '6924', '$2a$10$k9DoLa2jcRgd8.VzNhY.Bum5w26GFav/qrzh.Ey00FCW0Nrovehz6', '藤本百合香', 'pharmacist', true, '2026-03-05 14:30:48.498144', '2026-03-05 14:30:48.498144', '6924', '{}', '{}'),
	(21, '20400', '$2a$10$d3sjUtFHPxRPaBDmr83d/.bc9HTvpaqfgcLtwWVsiAxNscjao1pGK', '藤井貴之', 'pharmacist', true, '2026-03-05 14:30:59.720832', '2026-03-05 14:30:59.720832', '20400', '{}', '{}'),
	(22, '20595', '$2a$10$lKdhuP7V0D6Ejeh8PPm5EeMr1zJiA7IzZUs/Sa.NlyigOKx37dWT2', '藤本淳美', 'pharmacist', true, '2026-03-05 14:31:12.247011', '2026-03-05 14:31:12.247011', '20595', '{}', '{}'),
	(17, '6195', '$2a$10$o5M9IS.kH7HIZmS/JJWz2OyVEo8Ro/cl6PhqP7wW0kYPhv9Bv05qi', '大川裕子', 'pharmacist', true, '2026-03-05 14:30:19.369447', '2026-03-05 14:31:38.168884', '6195', '{5}', '{}');


--
-- Data for Name: work_diaries; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.work_diaries (id, diary_date, patient_counseling, first_visit_counseling, allergy_stop, regimen_check, regimen_operation, oral_scheduled, oral_done, oral_cancelled, oral_changed, oral_patient_counseling, oral_first_visit, oral_doubt, oral_propose, oral_inquiry, notes, created_at, updated_at) VALUES
	(8, '2026-03-06', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL, '2026-03-05 13:44:52.340829+09', '2026-03-05 13:44:52.340829+09'),
	(1, '2026-03-05', 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL, '2026-03-05 12:30:17.499559+09', '2026-03-05 16:25:14.591387+09');


--
-- Data for Name: work_diary_pharmacists; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.work_diary_pharmacists (id, diary_id, sort_order, pharmacist_name, start_time, end_time, has_lunch, lunch_minutes) VALUES
	(2, 1, 0, NULL, '08:30', '17:15', true, 60),
	(3, 8, 0, '塩飽英二', '08:30', '17:30', true, 60);


--
-- Name: auth_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.auth_logs_id_seq', 3, true);


--
-- Name: blood_results_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.blood_results_id_seq', 9, true);


--
-- Name: daily_reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.daily_reports_id_seq', 1, false);


--
-- Name: dose_check_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.dose_check_records_id_seq', 1, false);


--
-- Name: interventions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.interventions_id_seq', 4, true);


--
-- Name: medication_guidance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.medication_guidance_id_seq', 1, false);


--
-- Name: patients_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.patients_id_seq', 7, true);


--
-- Name: regimens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.regimens_id_seq', 7, true);


--
-- Name: scheduled_treatments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.scheduled_treatments_id_seq', 7, true);


--
-- Name: treatment_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.treatment_records_id_seq', 20, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 22, true);


--
-- Name: work_diaries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.work_diaries_id_seq', 13, true);


--
-- Name: work_diary_pharmacists_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.work_diary_pharmacists_id_seq', 3, true);


--
-- Name: auth_logs auth_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_logs
    ADD CONSTRAINT auth_logs_pkey PRIMARY KEY (id);


--
-- Name: blood_results blood_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_results
    ADD CONSTRAINT blood_results_pkey PRIMARY KEY (id);


--
-- Name: blood_results blood_results_treatment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_results
    ADD CONSTRAINT blood_results_treatment_id_key UNIQUE (treatment_id);


--
-- Name: daily_reports daily_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_reports
    ADD CONSTRAINT daily_reports_pkey PRIMARY KEY (id);


--
-- Name: daily_reports daily_reports_report_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_reports
    ADD CONSTRAINT daily_reports_report_date_key UNIQUE (report_date);


--
-- Name: dose_check_records dose_check_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dose_check_records
    ADD CONSTRAINT dose_check_records_pkey PRIMARY KEY (id);


--
-- Name: interventions interventions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interventions
    ADD CONSTRAINT interventions_pkey PRIMARY KEY (id);


--
-- Name: interventions interventions_record_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interventions
    ADD CONSTRAINT interventions_record_id_key UNIQUE (record_id);


--
-- Name: medication_guidance medication_guidance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_guidance
    ADD CONSTRAINT medication_guidance_pkey PRIMARY KEY (id);


--
-- Name: patients patients_patient_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_patient_no_key UNIQUE (patient_no);


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: regimens regimens_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regimens
    ADD CONSTRAINT regimens_name_key UNIQUE (name);


--
-- Name: regimens regimens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regimens
    ADD CONSTRAINT regimens_pkey PRIMARY KEY (id);


--
-- Name: scheduled_treatments scheduled_treatments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_treatments
    ADD CONSTRAINT scheduled_treatments_pkey PRIMARY KEY (id);


--
-- Name: treatment_records treatment_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_records
    ADD CONSTRAINT treatment_records_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: work_diaries work_diaries_diary_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_diaries
    ADD CONSTRAINT work_diaries_diary_date_key UNIQUE (diary_date);


--
-- Name: work_diaries work_diaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_diaries
    ADD CONSTRAINT work_diaries_pkey PRIMARY KEY (id);


--
-- Name: work_diary_pharmacists work_diary_pharmacists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_diary_pharmacists
    ADD CONSTRAINT work_diary_pharmacists_pkey PRIMARY KEY (id);


--
-- Name: idx_auth_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_logs_created ON public.auth_logs USING btree (created_at DESC);


--
-- Name: idx_auth_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_logs_user ON public.auth_logs USING btree (user_id);


--
-- Name: idx_dose_check_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dose_check_date ON public.dose_check_records USING btree (check_date);


--
-- Name: idx_medication_guidance_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_guidance_date ON public.medication_guidance USING btree (guidance_date);


--
-- Name: idx_medication_guidance_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_guidance_patient ON public.medication_guidance USING btree (patient_id);


--
-- Name: idx_treatment_records_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_records_date ON public.treatment_records USING btree (treatment_date);


--
-- Name: idx_treatment_records_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treatment_records_patient ON public.treatment_records USING btree (patient_id);


--
-- Name: auth_logs auth_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_logs
    ADD CONSTRAINT auth_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: blood_results blood_results_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_results
    ADD CONSTRAINT blood_results_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.scheduled_treatments(id) ON DELETE CASCADE;


--
-- Name: daily_reports daily_reports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_reports
    ADD CONSTRAINT daily_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: dose_check_records dose_check_records_checked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dose_check_records
    ADD CONSTRAINT dose_check_records_checked_by_fkey FOREIGN KEY (checked_by) REFERENCES public.users(id);


--
-- Name: interventions interventions_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interventions
    ADD CONSTRAINT interventions_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.scheduled_treatments(id) ON DELETE CASCADE;


--
-- Name: medication_guidance medication_guidance_pharmacist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_guidance
    ADD CONSTRAINT medication_guidance_pharmacist_id_fkey FOREIGN KEY (pharmacist_id) REFERENCES public.users(id);


--
-- Name: medication_guidance medication_guidance_treatment_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_guidance
    ADD CONSTRAINT medication_guidance_treatment_record_id_fkey FOREIGN KEY (treatment_record_id) REFERENCES public.treatment_records(id);


--
-- Name: scheduled_treatments scheduled_treatments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_treatments
    ADD CONSTRAINT scheduled_treatments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: scheduled_treatments scheduled_treatments_regimen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_treatments
    ADD CONSTRAINT scheduled_treatments_regimen_id_fkey FOREIGN KEY (regimen_id) REFERENCES public.regimens(id);


--
-- Name: treatment_records treatment_records_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_records
    ADD CONSTRAINT treatment_records_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: work_diary_pharmacists work_diary_pharmacists_diary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_diary_pharmacists
    ADD CONSTRAINT work_diary_pharmacists_diary_id_fkey FOREIGN KEY (diary_id) REFERENCES public.work_diaries(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 6L4oWqTAcr8mLehBYQF2XgvVjvg3KiQbrTylfry1gzspEmU8BExFjdat3V7BfjE

