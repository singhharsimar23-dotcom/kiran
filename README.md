# KIRAN (Karnataka Intelligent Renewable Analytics Network)

KIRAN is a robust, physics-grounded machine learning platform built to forecast, analyze, and manage renewable energy generation across the state of Karnataka, India. By combining Numerical Weather Prediction (NWP), atmospheric physics (`pvlib`), and XGBoost quantile regression, KIRAN provides high-confidence forecasts, real-time ramp alerts, and causal "Grid Observation Network" (GON) intelligence.

## 🚀 Live Demo
**Production Dashboard:** [https://kiran-dashboard.vercel.app](https://kiran-dashboard.vercel.app)

## 📁 Repository Structure

```text
kiran/
├── kiran-dashboard/          # Next.js 14 Frontend Application
│   ├── app/                  # App router pages (Forecast, Reserve, GON, Verify)
│   ├── components/           # Reusable React components (Charts, Sidebar, etc.)
│   ├── lib/                  # Utilities, Supabase queries, and TypeScript types
│   └── public/               # Static assets and pre-computed JSONs
├── scripts/                  # Python Data Engineering & ML Pipeline
│   ├── fetch_and_forecast.py # Main live forecasting script (Cron job)
│   ├── train_model.py        # ML training pipeline (XGBoost Quantile)
│   ├── compute_gon.py        # Causal discovery logic for GON map
│   └── seed_plants.py        # Database initialization for KPTCL fleet
├── model/                    # Serialized ML assets
│   ├── xgb_p10.json, etc.    # Quantile regression models (10th, 50th, 90th)
│   └── shap_background.parquet # Background dataset for SHAP attribution
├── .github/workflows/        # Automated CI/CD
│   ├── hourly_forecast.yml   # Runs `fetch_and_forecast.py` every hour
│   └── train.yml             # Manual trigger to retrain the models
├── requirements.txt          # Python dependencies
└── package.json              # Located inside `kiran-dashboard/` for Node deps
```

## 🧠 Core Technologies & Architecture

### Backend & Machine Learning (Python)
- **Data Ingestion:** Open-Meteo API for real-time and historical NWP (Numerical Weather Prediction).
- **Physics Layer:** `pvlib` is used to establish strict upper boundaries (clear-sky physics ceilings) to prevent model hallucinations.
- **Machine Learning:** `xgboost` quantile regression models predict the P10, P50, and P90 MW generation bands.
- **Explainability:** `shap` library provides real-time impact drivers (e.g., how much MW is lost due to cloud cover).
- **Database:** Supabase (PostgreSQL) acts as the central datastore for historical data, live forecasts, and model health metrics.

### Frontend Dashboard (Next.js)
- **Framework:** Next.js 14 (App Router) deployed on Vercel.
- **Styling:** Tailwind CSS with a custom cyberpunk-inspired design system.
- **Visualization:** `recharts` for high-performance time-series data and `d3-geo` for the interactive Grid Observation Network (GON) map.
- **Data Fetching:** Server Components securely fetch data from Supabase, rendering `force-dynamic` pages to guarantee live metrics without build-time caching issues.

## 🛠️ Setup Instructions for Judges/Evaluators

If you wish to run the project locally, follow these steps:

### 1. Database Setup
Ensure you have a Supabase project created with the following core tables:
- `plants` (Capacity, location, asset type)
- `forecasts` (P10, P50, P90, SHAP values, risk levels)
- `model_health` (MAE, Skill Score, per-plant metrics)

### 2. Dashboard Setup
```bash
cd kiran-dashboard
npm install
# Create a .env.local file with your Supabase credentials:
# NEXT_PUBLIC_SUPABASE_URL=your_url
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
npm run dev
```

### 3. ML Pipeline Setup
```bash
# In the root directory
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
# Set SUPABASE_URL and SUPABASE_KEY in your environment variables
python scripts/fetch_and_forecast.py
```

## 📊 Key Features Evaluated
- **Physics-Grounded ML:** Predictions are capped using true solar geometry and wind turbine power curves.
- **Reserve Procurement Mapping:** Uncertainty bands (P90-P10) are directly mapped to actionable MW reserve requirements.
- **Grid Observation Network (GON):** Algorithmic discovery of causal lags between distant power plants (e.g., wind fronts traversing the state).
- **Automated Benchmarking:** Continuous evaluation against a 24-hour persistence baseline, proven on a rigorous train/test split.
