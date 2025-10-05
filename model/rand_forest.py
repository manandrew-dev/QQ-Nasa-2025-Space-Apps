# ============================================================================
# WEATHER PREDICTION MODEL & API
# User Input: ONLY Date and Location → Output: RainTomorrow prediction
# ============================================================================

from flask import Flask, request, jsonify
import numpy as np
import pandas as pd
import os
from datetime import datetime
import joblib
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

# Try to import CORS, but don't fail if not available
try:
    from flask_cors import CORS
    CORS_AVAILABLE = True
except ImportError:
    CORS_AVAILABLE = False
    print("⚠️  flask-cors not installed. Install with: pip install flask-cors")

app = Flask(__name__)
if CORS_AVAILABLE:
    CORS(app)

model = None
MODEL_PATH = 'weather_model.pkl'

# ============================================================================
# WEATHER PREDICTOR CLASS
# ============================================================================

class WeatherPredictor:
    """
    Weather predictor using ONLY Date and Location as input.
    
    During training: Uses all weather features
    During prediction: Only needs Date and Location
    
    The model learns patterns from historical data and uses location/time
    statistics to make predictions.
    """
    
    def __init__(self, model_type='random_forest', task='classification'):
        """
        Initialize predictor.
        
        Parameters:
        -----------
        model_type : str
            'random_forest' or 'gradient_boosting'
        task : str
            'classification' (predict RainTomorrow Yes/No)
        """
        self.task = task
        
        if task == 'classification':
            if model_type == 'random_forest':
                self.model = RandomForestClassifier(
                    n_estimators=200,
                    max_depth=25,
                    min_samples_split=5,
                    min_samples_leaf=2,
                    random_state=42,
                    n_jobs=-1
                )
            elif model_type == 'gradient_boosting':
                from sklearn.ensemble import GradientBoostingClassifier
                self.model = GradientBoostingClassifier(
                    n_estimators=200,
                    max_depth=15,
                    learning_rate=0.05,
                    subsample=0.8,
                    random_state=42
                )
        
        self.scaler = StandardScaler()
        self.label_encoders = {}
        
        # Store statistics per location for inference
        self.location_stats = {}
        self.global_stats = {}
        
        self.reference_date = None
        self.is_fitted = False
        self.feature_columns = []
        
    def _encode_categorical(self, df, columns, fit=False):
        """Encode categorical columns."""
        df_encoded = df.copy()
        
        for col in columns:
            if col not in df_encoded.columns:
                continue
                
            if fit:
                self.label_encoders[col] = LabelEncoder()
                # Use .loc to avoid SettingWithCopyWarning
                df_encoded.loc[:, col] = df_encoded[col].fillna('Unknown')
                self.label_encoders[col].fit(df_encoded[col])
            
            if col in self.label_encoders:
                df_encoded.loc[:, col] = df_encoded[col].fillna('Unknown')
                # Handle unseen labels
                df_encoded.loc[:, col] = df_encoded[col].apply(
                    lambda x: x if x in self.label_encoders[col].classes_ else 'Unknown'
                )
                df_encoded.loc[:, col] = self.label_encoders[col].transform(df_encoded[col])
        
        return df_encoded
    
    def _extract_temporal_features(self, dates):
        """Extract temporal features from dates."""
        if not isinstance(dates, pd.DatetimeIndex):
            dates = pd.DatetimeIndex(pd.to_datetime(dates))
        
        features = {}
        
        # Day of year (seasonality)
        day_of_year = dates.dayofyear.values
        features['day_of_year_sin'] = np.sin(2 * np.pi * day_of_year / 365.25)
        features['day_of_year_cos'] = np.cos(2 * np.pi * day_of_year / 365.25)
        
        # Month
        months = dates.month.values
        features['month'] = months
        features['month_sin'] = np.sin(2 * np.pi * months / 12)
        features['month_cos'] = np.cos(2 * np.pi * months / 12)
        
        # Day of week
        day_of_week = dates.dayofweek.values
        features['day_of_week_sin'] = np.sin(2 * np.pi * day_of_week / 7)
        features['day_of_week_cos'] = np.cos(2 * np.pi * day_of_week / 7)
        
        # Days from reference
        if self.reference_date is not None:
            features['days_from_reference'] = (dates - self.reference_date).days.values
        else:
            features['days_from_reference'] = np.zeros(len(dates))
        
        return features
    
    def _calculate_location_statistics(self, df):
        """
        Calculate statistics for each location and globally.
        Used for predictions when only Date and Location are provided.
        """
        print("\n📊 Computing location statistics...")
        
        numeric_features = [
            'MinTemp', 'MaxTemp', 'Rainfall', 'Evaporation', 'Sunshine',
            'WindGustSpeed', 'WindSpeed9am', 'WindSpeed3pm',
            'Humidity9am', 'Humidity3pm',
            'Pressure9am', 'Pressure3pm',
            'Cloud9am', 'Cloud3pm',
            'Temp9am', 'Temp3pm'
        ]
        
        categorical_features = ['WindGustDir', 'WindDir9am', 'WindDir3pm', 'RainToday']
        
        # Global statistics (fallback)
        self.global_stats = {}
        for col in numeric_features:
            if col in df.columns:
                self.global_stats[col] = {
                    'mean': df[col].mean(),
                    'std': df[col].std(),
                    'median': df[col].median()
                }
        
        for col in categorical_features:
            if col in df.columns:
                self.global_stats[col] = df[col].mode()[0] if len(df[col].mode()) > 0 else 'Unknown'
        
        # Per-location statistics
        for location in df['Location'].unique():
            loc_data = df[df['Location'] == location]
            self.location_stats[location] = {}
            
            # Numeric features
            for col in numeric_features:
                if col in loc_data.columns:
                    self.location_stats[location][col] = {
                        'mean': loc_data[col].mean(),
                        'std': loc_data[col].std(),
                        'median': loc_data[col].median()
                    }
            
            # Categorical features (mode)
            for col in categorical_features:
                if col in loc_data.columns:
                    mode_val = loc_data[col].mode()[0] if len(loc_data[col].mode()) > 0 else 'Unknown'
                    self.location_stats[location][col] = mode_val
            
            # Add seasonal patterns (month-based)
            loc_data = loc_data.copy()  # Explicit copy to avoid warning
            loc_data.loc[:, 'month'] = pd.to_datetime(loc_data['Date']).dt.month
            self.location_stats[location]['seasonal'] = {}
            
            for month in range(1, 13):
                month_data = loc_data[loc_data['month'] == month]
                if len(month_data) > 0:
                    self.location_stats[location]['seasonal'][month] = {}
                    for col in numeric_features:
                        if col in month_data.columns:
                            self.location_stats[location]['seasonal'][month][col] = month_data[col].mean()
        
        print(f"✓ Statistics computed for {len(self.location_stats)} locations")
    
    def _prepare_training_features(self, df):
        df = df.copy()

        # Replace common missing value markers with np.nan
        df.replace(['NA', 'NaN', '', ' '], np.nan, inplace=True)

        # Set reference date
        dates = pd.to_datetime(df['Date'], errors='coerce')
        self.reference_date = dates.min()

        # Clean target
        if 'RainTomorrow' not in df.columns:
            raise ValueError("Missing 'RainTomorrow' column")

        df['RainTomorrow'] = df['RainTomorrow'].astype(str).str.strip()
        df = df[df['RainTomorrow'].isin(['Yes', 'No'])]

        # Recompute dates for filtered dataframe
        dates = pd.to_datetime(df['Date'], errors='coerce')

        # Calculate statistics for inference
        self._calculate_location_statistics(df)

        # Extract temporal features
        temporal_features = self._extract_temporal_features(dates)

        # Columns to encode
        categorical_cols = ['Location', 'WindGustDir', 'WindDir9am', 'WindDir3pm', 'RainToday']
        df[categorical_cols] = df[categorical_cols].fillna('Unknown')

        # Encode categorical features
        df = self._encode_categorical(df, categorical_cols, fit=True)

        # Explicitly encode RainTomorrow as 0 (No), 1 (Yes)
        df['RainTomorrow'] = df['RainTomorrow'].map({'No': 0, 'Yes': 1})
        y = df['RainTomorrow'].values.astype(int)

        # Prepare numeric features
        numeric_features = [
            'MinTemp', 'MaxTemp', 'Rainfall', 'Evaporation', 'Sunshine',
            'WindGustSpeed', 'WindSpeed9am', 'WindSpeed3pm',
            'Humidity9am', 'Humidity3pm',
            'Pressure9am', 'Pressure3pm',
            'Cloud9am', 'Cloud3pm',
            'Temp9am', 'Temp3pm'
        ]

        for col in numeric_features:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
                df[col] = df[col].fillna(df[col].mean())

        # Assemble features
        feature_list = []
        feature_names = []

        # Add temporal features
        for name, values in temporal_features.items():
            feature_list.append(values)
            feature_names.append(name)

        # Add categorical
        for col in categorical_cols:
            feature_list.append(df[col].values)
            feature_names.append(col)

        # Add numeric features
        for col in numeric_features:
            feature_list.append(df[col].values)
            feature_names.append(col)

        self.feature_columns = feature_names
        X = np.column_stack(feature_list)

        return X, y

    
    def _prepare_inference_features(self, dates, locations):
        """
        Prepare features using ONLY Date and Location.
        Uses stored statistics to fill in other features.
        
        Parameters:
        -----------
        dates : array-like
            Dates to predict for
        locations : array-like
            Location names
            
        Returns:
        --------
        X : np.ndarray
            Feature matrix with imputed values
        """
        dates = pd.to_datetime(dates)
        temporal_features = self._extract_temporal_features(dates)
        
        n_samples = len(dates)
        months = dates.month.values
        
        # Encode locations
        df_temp = pd.DataFrame({'Location': locations})
        df_temp = self._encode_categorical(df_temp, ['Location'], fit=False)
        location_encoded = df_temp['Location'].values
        
        # Build features in same order as training
        feature_dict = {}
        
        # Temporal features
        for name, values in temporal_features.items():
            feature_dict[name] = values
        
        # Location
        feature_dict['Location'] = location_encoded
        
        # For each sample, get location-specific statistics
        numeric_features = [
            'MinTemp', 'MaxTemp', 'Rainfall', 'Evaporation', 'Sunshine',
            'WindGustSpeed', 'WindSpeed9am', 'WindSpeed3pm',
            'Humidity9am', 'Humidity3pm',
            'Pressure9am', 'Pressure3pm',
            'Cloud9am', 'Cloud3pm',
            'Temp9am', 'Temp3pm'
        ]
        
        categorical_features = ['WindGustDir', 'WindDir9am', 'WindDir3pm', 'RainToday']
        
        # Initialize arrays for imputed features
        for col in categorical_features + numeric_features:
            feature_dict[col] = np.zeros(n_samples)
        
        # Fill in values based on location and month
        for i, (location, month) in enumerate(zip(locations, months)):
            # Get location statistics
            if location in self.location_stats:
                loc_stats = self.location_stats[location]
                
                # Use seasonal stats if available
                if 'seasonal' in loc_stats and month in loc_stats['seasonal']:
                    seasonal_stats = loc_stats['seasonal'][month]
                    
                    for col in numeric_features:
                        if col in seasonal_stats:
                            feature_dict[col][i] = seasonal_stats[col]
                        elif col in loc_stats:
                            feature_dict[col][i] = loc_stats[col]['mean']
                        else:
                            feature_dict[col][i] = self.global_stats.get(col, {}).get('mean', 0)
                else:
                    # Use location average
                    for col in numeric_features:
                        if col in loc_stats:
                            feature_dict[col][i] = loc_stats[col]['mean']
                        else:
                            feature_dict[col][i] = self.global_stats.get(col, {}).get('mean', 0)
                
                # Categorical features
                for col in categorical_features:
                    if col in loc_stats:
                        cat_val = loc_stats[col]
                        if col in self.label_encoders:
                            # Encode the categorical value
                            if cat_val in self.label_encoders[col].classes_:
                                feature_dict[col][i] = self.label_encoders[col].transform([cat_val])[0]
                            else:
                                feature_dict[col][i] = 0  # Unknown
                    else:
                        feature_dict[col][i] = 0
            else:
                # Use global statistics
                for col in numeric_features:
                    feature_dict[col][i] = self.global_stats.get(col, {}).get('mean', 0)
                for col in categorical_features:
                    feature_dict[col][i] = 0
        
        # Stack features in training order
        feature_list = [feature_dict[name] for name in self.feature_columns]
        X = np.column_stack(feature_list)
        
        return X
    
    def train(self, df, validation_split=0.2):
        """
        Train the model using full dataset.
        
        Parameters:
        -----------
        df : pd.DataFrame
            Must contain: Date, Location, all weather features, and RainTomorrow
        """
        print(f"\n🔧 Preparing training data...")
        
        if 'Date' not in df.columns or 'Location' not in df.columns:
            raise ValueError("Missing 'Date' or 'Location' column")
        
        X, y = self._prepare_training_features(df)
        
        print(f"📊 Training samples: {len(X)}")
        print(f"📊 Date range: {df['Date'].min()} to {df['Date'].max()}")
        print(f"📊 Locations: {df['Location'].nunique()}")
        print(f"📊 Features: {X.shape[1]}")
        
        # Split data
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=validation_split, random_state=42
        )
        
        print(f"\n⚙️  Scaling features...")
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_val_scaled = self.scaler.transform(X_val)
        
        print(f"🚀 Training {self.model.__class__.__name__}...")
        self.model.fit(X_train_scaled, y_train)
        
        # Validation metrics
        y_val_pred = self.model.predict(X_val_scaled)
        accuracy = accuracy_score(y_val, y_val_pred)
        
        print(f"\n📈 Validation Results:")
        print(f"  Accuracy: {accuracy:.4f}")
        
        if 'RainTomorrow' in self.label_encoders:
            target_names = self.label_encoders['RainTomorrow'].classes_
            print("\nClassification Report:")
            print(classification_report(y_val, y_val_pred, target_names=target_names))
        
        self.is_fitted = True
        print("\n✓ Training complete! Model can now predict using only Date and Location.")
        
        return {'accuracy': accuracy}
    
    def predict(self, dates, locations):
        """
        Predict rain tomorrow using ONLY date and location.
        
        Parameters:
        -----------
        dates : str, datetime, or list
            Date(s) to predict for
        locations : str or list
            Location name(s)
            
        Returns:
        --------
        predictions : array
            0/1 (No/Yes) predictions
        probabilities : array
            Probability of rain tomorrow
        """
        if not self.is_fitted:
            raise ValueError("Model must be trained first!")
        
        # Ensure inputs are lists
        if isinstance(dates, (str, datetime)):
            dates = [dates]
        if isinstance(locations, str):
            locations = [locations]
        
        # Prepare features
        X = self._prepare_inference_features(dates, locations)
        X_scaled = self.scaler.transform(X)
        
        # Predict
        predictions = self.model.predict(X_scaled)
        probabilities = self.model.predict_proba(X_scaled)[:, 1]
        
        return predictions, probabilities


# ============================================================================
# MODEL PERSISTENCE
# ============================================================================

def save_model(predictor, filepath='weather_model.pkl'):
    """Save the trained model."""
    model_data = {
        'model': predictor.model,
        'scaler': predictor.scaler,
        'label_encoders': predictor.label_encoders,
        'location_stats': predictor.location_stats,
        'global_stats': predictor.global_stats,
        'feature_columns': predictor.feature_columns,
        'reference_date': predictor.reference_date,
        'is_fitted': predictor.is_fitted,
        'task': predictor.task
    }
    joblib.dump(model_data, filepath)
    print(f"✓ Model saved to {filepath}")

def load_model(filepath='weather_model.pkl'):
    """Load a trained model."""
    model_data = joblib.load(filepath)
    
    predictor = WeatherPredictor(task=model_data['task'])
    predictor.model = model_data['model']
    predictor.scaler = model_data['scaler']
    predictor.label_encoders = model_data['label_encoders']
    predictor.location_stats = model_data['location_stats']
    predictor.global_stats = model_data['global_stats']
    predictor.feature_columns = model_data['feature_columns']
    predictor.reference_date = model_data['reference_date']
    predictor.is_fitted = model_data['is_fitted']
    predictor.task = model_data['task']
    
    print(f"✓ Model loaded from {filepath}")
    return predictor


# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        'name': 'Weather Prediction API',
        'version': '2.0',
        'description': 'Predicts RainTomorrow using ONLY Date and Location',
        'endpoints': {
            '/predict': 'POST - Predict rain tomorrow',
            '/predict/batch': 'POST - Batch predictions',
            '/locations': 'GET - List available locations',
            '/health': 'GET - Health check'
        },
        'example': {
            'url': '/predict',
            'method': 'POST',
            'body': {
                'date': '2025-12-25',
                'location': 'Sydney'
            }
        }
    })

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'locations_available': len(model.location_stats) if model else 0,
        'reference_date': str(model.reference_date) if model and model.reference_date else None,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/locations', methods=['GET'])
def locations():
    """Get list of available locations."""
    if model is None:
        return jsonify({'error': 'Model not loaded'}), 500
    
    available_locations = list(model.location_stats.keys())
    
    return jsonify({
        'locations': available_locations,
        'count': len(available_locations)
    })

@app.route('/predict', methods=['POST'])
def predict():
    """
    Predict rain tomorrow using ONLY date and location.
    
    Body: {
        "date": "2025-12-25",
        "location": "Sydney"
    }
    """
    try:
        if model is None:
            return jsonify({'error': 'Model not loaded'}), 500
        
        data = request.get_json()
        
        # Validate input
        if 'date' not in data or 'location' not in data:
            return jsonify({'error': 'Missing "date" or "location" field'}), 400
        
        date = data['date']
        location = data['location']
        
        # Predict
        predictions, probabilities = model.predict([date], [location])
        
        # Decode prediction
        pred_label = 'Yes' if predictions[0] == 1 else 'No'
        
        result = {
            'date': date,
            'location': location,
            'prediction': pred_label,
            'probability': float(probabilities[0]),
            'confidence': f"{probabilities[0]*100:.1f}%",
            'interpretation': f"{'High' if probabilities[0] > 0.7 else 'Moderate' if probabilities[0] > 0.4 else 'Low'} chance of rain tomorrow",
            'timestamp': datetime.now().isoformat()
        }
        
        return jsonify(result)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/predict/batch', methods=['POST'])
def predict_batch():
    """
    Batch predictions for multiple date/location combinations.
    
    Body: {
        "predictions": [
            {"date": "2025-12-25", "location": "Sydney"},
            {"date": "2025-12-26", "location": "Melbourne"}
        ]
    }
    """
    try:
        if model is None:
            return jsonify({'error': 'Model not loaded'}), 500
        
        data = request.get_json()
        
        if 'predictions' not in data:
            return jsonify({'error': 'Missing "predictions" field'}), 400
        
        predictions_input = data['predictions']
        
        # Extract dates and locations
        dates = [p['date'] for p in predictions_input]
        locations = [p['location'] for p in predictions_input]
        
        # Predict
        predictions, probabilities = model.predict(dates, locations)
        
        # Format results
        results = []
        for i, (date, location, pred, prob) in enumerate(zip(dates, locations, predictions, probabilities)):
            pred_label = model.label_encoders['RainTomorrow'].inverse_transform([pred])[0]
            
            results.append({
                'date': date,
                'location': location,
                'prediction': pred_label,
                'probability': float(prob),
                'confidence': f"{prob*100:.1f}%"
            })
        
        return jsonify({
            'predictions': results,
            'count': len(results),
            'timestamp': datetime.now().isoformat()
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================================================
# DEMO DATA GENERATION
# ============================================================================

def generate_demo_weather_data(n_samples=5000):
    """Generate synthetic Australian weather data."""
    np.random.seed(42)
    
    locations = ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Hobart', 'Darwin', 'Canberra']
    wind_dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    
    start_date = pd.Timestamp('2020-01-01')
    dates = [start_date + pd.Timedelta(days=int(d)) for d in np.random.randint(0, 365*3, n_samples)]
    
    df = pd.DataFrame({
        'Date': dates,
        'Location': np.random.choice(locations, n_samples),
        'MinTemp': np.random.uniform(5, 20, n_samples),
        'MaxTemp': np.random.uniform(15, 35, n_samples),
        'Rainfall': np.random.exponential(2, n_samples),
        'Evaporation': np.random.uniform(0, 10, n_samples),
        'Sunshine': np.random.uniform(0, 12, n_samples),
        'WindGustDir': np.random.choice(wind_dirs, n_samples),
        'WindGustSpeed': np.random.uniform(20, 60, n_samples),
        'WindDir9am': np.random.choice(wind_dirs, n_samples),
        'WindDir3pm': np.random.choice(wind_dirs, n_samples),
        'WindSpeed9am': np.random.uniform(5, 30, n_samples),
        'WindSpeed3pm': np.random.uniform(5, 35, n_samples),
        'Humidity9am': np.random.uniform(40, 95, n_samples),
        'Humidity3pm': np.random.uniform(30, 85, n_samples),
        'Pressure9am': np.random.uniform(1005, 1025, n_samples),
        'Pressure3pm': np.random.uniform(1005, 1025, n_samples),
        'Cloud9am': np.random.randint(0, 9, n_samples),
        'Cloud3pm': np.random.randint(0, 9, n_samples),
        'Temp9am': np.random.uniform(10, 25, n_samples),
        'Temp3pm': np.random.uniform(15, 32, n_samples),
        'RainToday': np.random.choice(['No', 'Yes'], n_samples, p=[0.7, 0.3])
    })
    
    # Generate RainTomorrow based on features
    rain_score = (
        (df['Humidity3pm'] > 70).astype(int) * 30 +
        (df['Pressure3pm'] < 1010).astype(int) * 25 +
        (df['Cloud3pm'] > 5).astype(int) * 20 +
        (df['RainToday'] == 'Yes').astype(int) * 25 +
        np.random.uniform(0, 10, n_samples)
    )
    
    df['RainTomorrow'] = (rain_score > 50).map({True: 'Yes', False: 'No'})
    
    return df


# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    PORT = int(os.environ.get('PORT', 8000))
    
    print("=" * 70)
    print("WEATHER PREDICTION API - DATE & LOCATION ONLY")
    print("=" * 70)
    
    # Check if model exists
    if not os.path.exists(MODEL_PATH):
        print("\n⚠️  No saved model found. Training new model...")
        print("=" * 70)
        
        # Generate demo data
        # df = generate_demo_weather_data(5000)
        df = pd.read_csv('weatherAUS.csv')
        print(f"✓ Generated {len(df)} training samples")
        print(f"  Date range: {df['Date'].min()} to {df['Date'].max()}")
        print(f"  Locations: {df['Location'].unique()}")
        
        # Train model
        predictor = WeatherPredictor(model_type='random_forest', task='classification')
        predictor.train(df)
        
        # Save model
        save_model(predictor, MODEL_PATH)
        
        model = predictor
    else:
        print("\n✓ Loading existing model...")
        model = load_model(MODEL_PATH)
    
    print("\n" + "=" * 70)
    print("EXAMPLE USAGE:")
    print("=" * 70)
    print(f"""
    # Simple prediction with ONLY date and location
    curl -X POST http://localhost:8000/predict \\
      -H "Content-Type: application/json" \\
      -d '{{"date": "2025-12-25", "location": "Sydney"}}'
    
    # Batch predictions
    curl -X POST http://localhost:{PORT}/predict/batch \\
      -H "Content-Type: application/json" \\
      -d '{{
        "predictions": [
          {{"date": "2025-12-25", "location": "Sydney"}},
          {{"date": "2025-12-26", "location": "Melbourne"}}
        ]
      }}'
    
    # Get available locations
    curl http://localhost:{PORT}/locations
    """)
    
    print("=" * 70)
    print(f"Starting Flask server on http://localhost:{PORT}")
    print("=" * 70)
    
    app.run(host='0.0.0.0', port=PORT, debug=True)
