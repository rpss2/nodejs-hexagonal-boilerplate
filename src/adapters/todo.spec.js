import { getDocument, putDocument, updateDocument, deleteDocument } from '../ports/state-machines/aws.dynamo'
import { adapter } from './index'
import { ETodoStatus, EPriority } from '../business/constants'
import { validateUpdateTodo } from '../business/todo'
import moment from 'moment'
import R from 'ramda'
import { v4 as uuidv4 } from 'uuid'

/**
 * this adapter will mock all methods from aws.dynamo port
 */
jest.mock('../ports/state-machines/aws.dynamo')

/**
 * mock escriba calls
 */
const escribaMock = {
  info: jest.fn((args) => (args)).mockReturnValue(undefined)
}

/**
 * mock repository structure to test your elements
 */
const repositoryMock = {
  getDocument,
  putDocument,
  updateDocument,
  deleteDocument
}

/**
 * mock instantiated adapter
 */
const adapterInstiated = adapter(escribaMock, repositoryMock)

describe('getTodo', () => {
  beforeEach(() => {
    getDocument.mockReset()
  })

  const getDocumentMock = (args) => jest.fn().mockResolvedValue({
    id: args.id,
    taskOrder: 0,
    taskDescription: 'mocktaskDescription',
    taskOwner: 'owner',
    taskStatus: ETodoStatus.IN_PROGRESS,
    taskPriority: EPriority.MODERATE,
    creationDate: moment().toISOString(),
    lastUpdateDate: null
  })

  const newId = uuidv4()

  test('default case', async () => {
    repositoryMock.getDocument.mockImplementationOnce((args) => getDocumentMock(args)())

    await expect(adapterInstiated.getTodo(newId))
      .resolves.toMatchObject({
        id: newId,
        taskOrder: 0,
        taskDescription: 'mocktaskDescription',
        taskOwner: 'owner',
        taskStatus: ETodoStatus.IN_PROGRESS,
        taskPriority: EPriority.MODERATE
      })
    expect(getDocument).toHaveBeenCalled()
    expect(getDocument).toHaveBeenLastCalledWith({ id: newId })
  })

  test('throw error', async () => {
    const getDocumentErrorMock = (args) => jest.fn().mockRejectedValue(new Error('invalid id'))
    repositoryMock.getDocument.mockImplementationOnce((args) => getDocumentErrorMock(args)())

    await expect(adapterInstiated.getTodo(newId)).rejects.toThrow('invalid id')
    expect(getDocument).toHaveBeenCalled()
    expect(getDocument).toHaveBeenLastCalledWith({ id: newId })
  })
})

describe('createTodo', () => {
  beforeEach(() => {
    putDocument.mockReset()
  })

  const putDocumentMock = (args) => jest.fn().mockResolvedValue(args)

  const newData = {
    taskOrder: 0,
    taskDescription: 'testDescription',
    taskPriority: EPriority.HIGH
  }

  test('default case', async () => {
    repositoryMock.putDocument.mockImplementationOnce((args) => putDocumentMock(args)())
    const insertedData = await adapterInstiated.createTodo(newData, 'owner')

    expect(insertedData).toMatchObject({
      ...newData,
      taskStatus: ETodoStatus.NEW,
      taskOwner: 'owner'
    })
    expect(putDocument).toHaveBeenCalled()
    expect(putDocument).toHaveBeenLastCalledWith(insertedData)
    expect(escribaMock.info).toHaveBeenCalled()
    expect(escribaMock.info).toHaveBeenCalledWith({
      action: 'TASK_CREATED',
      method: 'adapters.todo.createTodo',
      data: { documentInserted: insertedData }
    })
  })

  test('throw error', async () => {
    const putDocumentErrorMock = (args) => jest.fn().mockRejectedValue(new Error('invalid data'))
    repositoryMock.putDocument.mockImplementationOnce((args) => putDocumentErrorMock(args)())

    await expect(adapterInstiated.createTodo(newData, 'owner')).rejects.toThrow('invalid data')
    expect(putDocument).toHaveBeenCalled()
  })

  test('throw error with invalid data (business validation)', async () => {
    repositoryMock.putDocument.mockImplementationOnce((args) => putDocumentMock(args)())

    await expect(adapterInstiated.createTodo({}, 'owner')).rejects.toThrow()
    expect(putDocument).not.toHaveBeenCalled()
  })
})

describe('updateTodo', () => {
  beforeEach(() => {
    updateDocument.mockReset()
    getDocument.mockReset()
  })

  const newData = {
    id: uuidv4(),
    taskOrder: 0,
    taskDescription: 'testDescriptionUpdate',
    taskPriority: EPriority.HIGH,
    taskStatus: ETodoStatus.NEW,
    taskOwner: 'owner',
    creationData: moment().toISOString(),
    lastUpdateDate: null
  }

  const updatedData = {
    taskPriority: EPriority.LOW,
    taskStatus: ETodoStatus.IN_PROGRESS
  }

  const getDocumentMock = jest.fn().mockResolvedValue(newData)
  const updatedTodoMock = validateUpdateTodo(updatedData, newData, 'updateOwner')
  const updateDocumentMock = (key, updateExpression, expressionAttributeValues) => jest.fn().mockResolvedValue(updatedTodoMock)

  test('default case', async () => {
    repositoryMock.updateDocument.mockImplementationOnce((key, updateExpression, expressionAttributeValues) => updateDocumentMock(key, updateExpression, expressionAttributeValues)())
    repositoryMock.getDocument.mockImplementationOnce(getDocumentMock)
    const updatedTodo = await adapterInstiated.updateTodo(newData.id, updatedData, 'updateOwner')
    expect(updatedTodo).toMatchObject(updatedTodoMock)
    const updateExpression = `
    set taskOrder = :taskOrder,
        taskDescription = :taskDescription,
        taskStatus = :taskStatus,
        taskPriority = :taskPriority,
        creationData = :creationData,
        lastUpdateDate = :lastUpdateDate
    `
    expect(updateDocument).toHaveBeenCalled()
    expect(updateDocument).toHaveBeenCalledWith({ id: newData.id }, updateExpression, expect.objectContaining(R.dissoc('lastUpdateDate', updatedTodo)))
    expect(escribaMock.info).toHaveBeenCalled()
    expect(escribaMock.info).toHaveBeenCalledWith({
      action: 'TASK_UPDATED',
      method: 'adapters.todo.updateTodo',
      data: updatedTodo
    })
  })

  test('throw error', async () => {
    const updateDocumentMockError = (key, updateExpression, expressionAttributeValues) => jest.fn().mockRejectedValue(new Error('invalid data'))
    repositoryMock.updateDocument.mockImplementationOnce((key, updateExpression, expressionAttributeValues) => updateDocumentMockError(key, updateExpression, expressionAttributeValues)())
    repositoryMock.getDocument.mockImplementationOnce(getDocumentMock)

    await expect(adapterInstiated.updateTodo(newData.id, updatedData, 'ownerUpdateError')).rejects.toThrow()
    expect(updateDocument).toHaveBeenCalled()
  })

  test('throw error with invalid data (business validation)', async () => {
    repositoryMock.updateDocument.mockImplementationOnce((key, updateExpression, expressionAttributeValues) => updateDocumentMock(key, updateExpression, expressionAttributeValues)())
    repositoryMock.getDocument.mockImplementationOnce(getDocumentMock)

    await expect(adapterInstiated.updateTodo(newData.id, {}, 'ownerUpdateErrorValidation')).rejects.toThrow()
    expect(updateDocument).not.toHaveBeenCalled()
  })
})

describe('deleteTodo', () => {
  beforeEach(() => {
    deleteDocument.mockReset()
  })

  const newData = {
    id: uuidv4(),
    taskOrder: 0,
    taskDescription: 'testDescriptionUpdate',
    taskPriority: EPriority.HIGH,
    taskStatus: ETodoStatus.NEW,
    taskOwner: 'owner',
    creationData: moment().toISOString(),
    lastUpdateDate: null
  }

  const deleteDocumentMock = (args) => jest.fn().mockResolvedValue(newData)
  const getDocumentMock = jest.fn().mockResolvedValue(newData)

  test('default case', async () => {
    repositoryMock.deleteDocument.mockImplementationOnce((args) => deleteDocumentMock(args)())
    repositoryMock.getDocument.mockImplementationOnce(getDocumentMock)
    const deletedTodo = await adapterInstiated.deleteTodo(newData.id, 'deleteOwner')
    expect(deletedTodo).toMatchObject(newData)
    expect(deleteDocument).toHaveBeenCalled()
    expect(deleteDocument).toHaveBeenCalledWith({ id: newData.id })
    expect(escribaMock.info).toHaveBeenCalled()
    expect(escribaMock.info).toHaveBeenCalledWith({
      action: 'TASK_DELETED',
      method: 'adapters.todo.deleteTodo',
      data: deletedTodo
    })
  })

  test('throw error', async () => {
    const deleteDocumentErrorMock = (args) => jest.fn().mockRejectedValue(new Error('invalid id'))
    repositoryMock.deleteDocument.mockImplementationOnce((args) => deleteDocumentErrorMock(args)())
    repositoryMock.getDocument.mockImplementationOnce(getDocumentMock)

    await expect(adapterInstiated.deleteTodo(newData.id, 'deleteOwner')).rejects.toThrow()
    expect(getDocument).toHaveBeenCalled()
    expect(getDocument).toHaveBeenCalledWith({ id: newData.id })
  })
})
