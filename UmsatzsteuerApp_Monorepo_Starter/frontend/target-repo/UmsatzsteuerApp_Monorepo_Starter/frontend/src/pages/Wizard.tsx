import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import StepPeriod from "@/components/wizard/StepPeriod";
import StepUpload from "@/components/wizard/StepUpload";
import StepReview from "@/components/wizard/StepReview";
import StepSubmit from "@/components/wizard/StepSubmit";

const STEPS = [
  { id: 1, title: "Periode wählen", description: "Monat/Quartal/Jahr auswählen" },
  { id: 2, title: "Belege hochladen", description: "PDF, JPG oder PNG" },
  { id: 3, title: "Prüfen & Korrigieren", description: "Einträge überprüfen" },
  { id: 4, title: "Freigabe & Versand", description: "ELSTER senden oder exportieren" },
];

const Wizard = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [periodData, setPeriodData] = useState({ month: "09", year: "2025" });

  const progress = (currentStep / STEPS.length) * 100;

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
            <ArrowLeft className="h-4 w-4" />
            Zurück zum Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-foreground">UStVA Assistent</h1>
          <p className="text-muted-foreground mt-1">Umsatzsteuervoranmeldung vorbereiten</p>
        </div>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Schritt {currentStep} von {STEPS.length}</span>
              <span className="text-muted-foreground">{Math.round(progress)}% abgeschlossen</span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between gap-2">
              {STEPS.map((step) => (
                <div
                  key={step.id}
                  className={`flex-1 text-center ${
                    step.id <= currentStep ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2 mb-1">
                    {step.id < currentStep ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                          step.id === currentStep
                            ? "bg-primary text-primary-foreground"
                            : step.id < currentStep
                            ? "bg-success text-success-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {step.id}
                      </div>
                    )}
                  </div>
                  <div className="text-xs font-medium hidden sm:block">{step.title}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
          <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 1 && <StepPeriod data={periodData} onChange={setPeriodData} />}
          {currentStep === 2 && <StepUpload period={periodData} />}
          {currentStep === 3 && <StepReview period={periodData} />}
          {currentStep === 4 && <StepSubmit period={periodData} />}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 1}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zurück
        </Button>
        <Button
          onClick={handleNext}
          disabled={currentStep === STEPS.length}
        >
          Weiter
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
};

export default Wizard;
