import { useState, useCallback, useMemo } from 'react';
import { useWorkspace } from '../state/workspace-provider';
import { addStep, updateStep, moveStep, deleteStep } from '../domain/steps';
import { addReference } from '../domain/references';

/**
 * StepEditor renders the UI for managing steps within a flow.
 *
 * Props
 * -----
 * flowId: string – the id of the flow to edit.
 *
 * Features
 * --------
 * - List existing steps with edit, delete, and reorder controls.
 * - Create a new step via a form.
 * - Edit an existing step via a form.
 * - Add a table reference to a step (multi‑select not yet implemented – a simple dropdown).
 * - All operations are performed through the workspace provider's `applyOperation`
 *   using the domain functions (T033/T034).
 * - Local error messages are displayed inline.
 *
 * Test IDs
 * --------
 * flow-detail, new-step, step-name, step-note, step-apply, step-cancel,
 * step-row-<stepId>, step-add-table-<stepId>, step-table-select, step-table-apply
 */
export function StepEditor({ flowId }: { flowId: string }) {
    const ctx = useWorkspace();
    const { state, applyOperation } = ctx;

    const flow = useMemo(
        () => state.draft.business?.flows.find((f) => f.flowId === flowId),
        [state, flowId]
    );

    if (!flow) {
        return <div data-testid="flow-detail">Flow not found.</div>;
    }

    // --- New step form state
    const [showNew, setShowNew] = useState(false);
    const [newName, setNewName] = useState('');
    const [newNote, setNewNote] = useState('');

    // --- Edit step state
    const [editingStepId, setEditingStepId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editNote, setEditNote] = useState('');

    // --- Add table reference state
    const [addingTableStepId, setAddingTableStepId] = useState<string | null>(null);
    const [selectedTableId, setSelectedTableId] = useState('');

    // --- Error state
    const [error, setError] = useState<string | null>(null);

    // Tables belonging to the flow's database
    const tablesForFlow = useMemo(() => {
        const dbId = flow.databaseId;
        return state.draft.catalog.tables.filter((t) => t.databaseId === dbId);
    }, [state, flow]);

    // Handlers
    const handleAddStep = useCallback(() => {
        const name = newName.trim();
        if (!name) {
            setError('Step name cannot be empty');
            return;
        }
        const result = addStep(state, { flowId, name, note: newNote });
        if (result.ok) {
            applyOperation(() => ({ ok: true, state: result.state }));
            setShowNew(false);
            setNewName('');
            setNewNote('');
            setError(null);
        } else {
            setError(result.error.message);
        }
    }, [state, flowId, newName, newNote, applyOperation]);

    const handleEditStep = useCallback(() => {
        if (!editingStepId) return;
        const name = editName.trim();
        if (!name) {
            setError('Step name cannot be empty');
            return;
        }
        const result = updateStep(state, {
            flowId,
            stepId: editingStepId,
            name,
            note: editNote,
        });
        if (result.ok) {
            applyOperation(() => ({ ok: true, state: result.state }));
            setEditingStepId(null);
            setEditName('');
            setEditNote('');
            setError(null);
        } else {
            setError(result.error.message);
        }
    }, [state, flowId, editingStepId, editName, editNote, applyOperation]);

    const handleDeleteStep = useCallback(
        (stepId: string) => {
            const result = deleteStep(state, { flowId, stepId, confirmed: true });
            if (result.ok) {
                applyOperation(() => ({ ok: true, state: result.state }));
            } else {
                setError(result.error.message);
            }
        },
        [state, flowId, applyOperation]
    );

    const handleMoveStep = useCallback(
        (stepId: string, toIndex: number) => {
            const result = moveStep(state, { flowId, stepId, toIndex });
            if (result.ok) {
                applyOperation(() => ({ ok: true, state: result.state }));
            } else {
                setError(result.error.message);
            }
        },
        [state, flowId, applyOperation]
    );

    const handleAddTable = useCallback((stepId: string) => {
        setAddingTableStepId(stepId);
        setSelectedTableId('');
    }, []);

    const handleApplyTable = useCallback(() => {
        if (!addingTableStepId || !selectedTableId) return;
        const result = addReference(state, {
            flowId,
            stepId: addingTableStepId,
            tableId: selectedTableId,
        });
        if (result.ok) {
            applyOperation(() => ({ ok: true, state: result.state }));
            setAddingTableStepId(null);
            setSelectedTableId('');
        } else {
            setError(result.error.message);
        }
    }, [state, flowId, addingTableStepId, selectedTableId, applyOperation]);

    const handleCancelTable = useCallback(() => {
        setAddingTableStepId(null);
        setSelectedTableId('');
    }, []);

    // Render
    return (
        <div data-testid="flow-detail">
            <h2>Flow: {flow.name}</h2>
            {error && <div style={{ color: 'red' }}>{error}</div>}

            <button data-testid="new-step" onClick={() => setShowNew(true)}>
                New Step
            </button>

            {showNew && (
                <div>
                    <input
                        data-testid="step-name"
                        placeholder="Name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                    />
                    <input
                        data-testid="step-note"
                        placeholder="Note"
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                    />
                    <button data-testid="step-apply" onClick={handleAddStep}>
                        Apply
                    </button>
                    <button data-testid="step-cancel" onClick={() => { setShowNew(false); setNewName(''); setNewNote(''); setError(null); }}>
                        Cancel
                    </button>
                </div>
            )}

            <ul>
                {flow.steps.map((step, idx) => (
                    <li key={step.stepId} data-testid={`step-row-${step.stepId}`}>
                        <strong>{step.name}</strong>
                        {step.note && <span> - {step.note}</span>}

                        <button onClick={() => { setEditingStepId(step.stepId); setEditName(step.name); setEditNote(step.note ?? ''); }}>
                            Edit
                        </button>
                        <button onClick={() => handleDeleteStep(step.stepId)}>Delete</button>

                        {idx > 0 && (
                            <button onClick={() => handleMoveStep(step.stepId, idx - 1)}>Up</button>
                        )}
                        {idx < flow.steps.length - 1 && (
                            <button onClick={() => handleMoveStep(step.stepId, idx + 1)}>Down</button>
                        )}

                        <button data-testid={`step-add-table-${step.stepId}`} onClick={() => handleAddTable(step.stepId)}>
                            Add Table
                        </button>

                        {addingTableStepId === step.stepId && (
                            <div>
                                <select
                                    data-testid="step-table-select"
                                    value={selectedTableId}
                                    onChange={(e) => setSelectedTableId(e.target.value)}
                                >
                                    <option value="">Select table</option>
                                    {tablesForFlow.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name}
                                        </option>
                                    ))}
                                </select>
                                <button data-testid="step-table-apply" onClick={handleApplyTable}>
                                    Apply
                                </button>
                                <button onClick={handleCancelTable}>Cancel</button>
                            </div>
                        )}

                        {editingStepId === step.stepId && (
                            <div>
                                <input
                                    data-testid="step-name"
                                    placeholder="Name"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                />
                                <input
                                    data-testid="step-note"
                                    placeholder="Note"
                                    value={editNote}
                                    onChange={(e) => setEditNote(e.target.value)}
                                />
                                <button data-testid="step-apply" onClick={handleEditStep}>
                                    Apply
                                </button>
                                <button data-testid="step-cancel" onClick={() => { setEditingStepId(null); setEditName(''); setEditNote(''); }}>
                                    Cancel
                                </button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
