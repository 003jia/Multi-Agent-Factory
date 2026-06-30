import { stageLabels, workflowOrder } from "../lib/stage";
import type { TaskStage } from "../types";

interface WorkflowTimelineProps {
  stage: TaskStage;
}

export function WorkflowTimeline({ stage }: WorkflowTimelineProps) {
  const currentIndex = workflowOrder.indexOf(stage === "revision" ? "review" : stage);

  return (
    <ol className="timeline" aria-label="任务流程">
      {workflowOrder.map((item, index) => {
        const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "next";
        return (
          <li className={`timeline-step timeline-${state}`} key={item}>
            <span className="timeline-index">{index + 1}</span>
            <span>{stageLabels[item]}</span>
          </li>
        );
      })}
    </ol>
  );
}
