import pandas as pd
import pickle
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

data = {
    "text": [
        "potholes on road","road damaged",
        "garbage overflow","waste not collected",
        "no water supply","water leakage",
        "power cut","transformer sparking",
        "street light not working","street light broken"
    ],
    "category": [
        "Road","Road",
        "Sanitation","Sanitation",
        "Water","Water",
        "Electricity","Electricity",
        "StreetLight","StreetLight"
    ]
}

df = pd.DataFrame(data)

X_train, X_test, y_train, y_test = train_test_split(
    df["text"], df["category"], test_size=0.2, random_state=42
)

vectorizer = TfidfVectorizer(stop_words="english")
X_train_vec = vectorizer.fit_transform(X_train)
X_test_vec = vectorizer.transform(X_test)

model = LogisticRegression(max_iter=1000)
model.fit(X_train_vec, y_train)

accuracy = accuracy_score(y_test, model.predict(X_test_vec))

pickle.dump(model, open("model.pkl","wb"))
pickle.dump(vectorizer, open("vectorizer.pkl","wb"))
pickle.dump(accuracy, open("accuracy.pkl","wb"))

print("✅ NLP Accuracy:", round(accuracy*100,2), "%")